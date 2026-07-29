/**
 * Minimal client-side expression preview.
 *
 * Supports the documented public surface most commonly seen in shared
 * workflows: `{{ ... }}` interpolation, a leading `=` to mark an expression
 * field, and the `$json`, `$item`, `$itemIndex`, `$now`, `$today`, `$input`,
 * `$("Node Name")`, `$vars` and `$env` helpers. This is a *preview* evaluator
 * for the editor only — the real engine will run server-side in a sandbox.
 */

export interface ExpressionContext {
  json: Record<string, unknown>;
  itemIndex?: number;
  allItems?: Array<{ json: Record<string, unknown> }>;
  nodeData?: Record<string, Array<{ json: Record<string, unknown> }>>;
  vars?: Record<string, unknown>;
  env?: Record<string, string>;
  /** When set, only these env var names are exposed to expressions. */
  envAllowlist?: string[];
  /** Execution metadata; defaults to a preview placeholder when omitted. */
  execution?: { id: string; mode: "manual" | "webhook" | "trigger"; resumeUrl?: string };
}

export interface EvalResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  /** True when the input contained no expression at all. */
  literal: boolean;
}

export function isExpression(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(value);
}

type FlowDateUnit = "second" | "minute" | "hour" | "day" | "month" | "year";

/** Date subclass that adds a `.plus(amount, unit)` helper for $now. */
class FlowDate extends Date {
  plus(amount: number, unit: FlowDateUnit): FlowDate {
    const d = new FlowDate(this.getTime());
    switch (unit) {
      case "second":
        d.setSeconds(d.getSeconds() + amount);
        break;
      case "minute":
        d.setMinutes(d.getMinutes() + amount);
        break;
      case "hour":
        d.setHours(d.getHours() + amount);
        break;
      case "day":
        d.setDate(d.getDate() + amount);
        break;
      case "month":
        d.setMonth(d.getMonth() + amount);
        break;
      case "year":
        d.setFullYear(d.getFullYear() + amount);
        break;
    }
    return d;
  }
}

/**
 * Minimal JMESPath-like query engine.
 * Supports: "key", "[*]", "items[*].field", "items[0].field", "a.b.c".
 */
function jmespath(query: string, data: unknown): unknown {
  if (query == null || query === "") return data;
  let current: unknown = data;
  let mapMode = false;

  const getKey = (val: unknown, k: string): unknown => {
    if (val == null || typeof val !== "object") return undefined;
    return (val as Record<string, unknown>)[k];
  };

  for (const seg of String(query).split(".")) {
    if (current == null) return null;
    const m = seg.match(/^([^[]*)?(\[(\*|\d+)\])?$/);
    if (!m) continue;
    const key = m[1] || "";
    const bracket = m[3];

    if (key) {
      if (mapMode) {
        if (!Array.isArray(current)) return null;
        current = current.map((item) => getKey(item, key));
      } else {
        current = getKey(current, key);
      }
    }

    if (bracket !== undefined) {
      if (bracket === "*") {
        if (!Array.isArray(current)) return null;
        mapMode = true;
      } else {
        const idx = parseInt(bracket, 10);
        if (mapMode) {
          if (!Array.isArray(current)) return null;
          current = current.map((item) => (Array.isArray(item) ? item[idx] : null));
        } else {
          if (!Array.isArray(current)) return null;
          current = current[idx];
        }
      }
    }
  }

  return current;
}

function buildScope(ctx: ExpressionContext) {
  const items = ctx.allItems ?? [{ json: ctx.json }];
  const nodeAccessor = (name: string) => {
    const data = ctx.nodeData?.[name] ?? [];
    return {
      all: () => data,
      first: () => data[0] ?? { json: {} },
      last: () => data[data.length - 1] ?? { json: {} },
      item: data[ctx.itemIndex ?? 0] ?? { json: {} },
      isExecuted: data.length > 0,
    };
  };

  const envRaw = ctx.env ?? {};
  const allow = ctx.envAllowlist;
  const $env = allow
    ? Object.fromEntries(allow.filter((k) => k in envRaw).map((k) => [k, envRaw[k]]))
    : envRaw;

  return {
    $json: ctx.json,
    $itemIndex: ctx.itemIndex ?? 0,
    $input: {
      all: () => items,
      first: () => items[0] ?? { json: {} },
      last: () => items[items.length - 1] ?? { json: {} },
      item: items[ctx.itemIndex ?? 0] ?? { json: {} },
    },
    $now: new FlowDate(),
    $today: new FlowDate(new Date().toDateString()),
    $vars: ctx.vars ?? {},
    $env,
    $execution: ctx.execution ?? { id: "preview", mode: "manual" as const, resumeUrl: "" },
    $workflow: { id: "preview", active: false },
    $if: (cond: unknown, a: unknown, b: unknown) => (cond ? a : b),
    $jmespath: (query: string, data?: unknown) => jmespath(query, data ?? ctx.json),
    $isEmpty: (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0),
    $isNotEmpty: (v: unknown) => !(v == null || v === "" || (Array.isArray(v) && v.length === 0)),
    $max: (...n: number[]) => Math.max(...n),
    $min: (...n: number[]) => Math.min(...n),
    $node: nodeAccessor,
  };
}

function runSnippet(expr: string, ctx: ExpressionContext): unknown {
  const scope = buildScope(ctx) as Record<string, unknown>;
  const keys = Object.keys(scope);
  const values = keys.map((k) => scope[k]);
  // `$("Node")` is passed in as a named argument since `$` is a valid identifier.
  const body = `"use strict";\nreturn ( ${expr} );`;
  // eslint-disable-next-line no-new-func
  const fn = new Function("$", ...keys, body) as (...args: unknown[]) => unknown;
  return fn(scope.$node, ...values);
}

export function evaluateExpression(input: unknown, ctx: ExpressionContext): EvalResult {
  if (typeof input !== "string") return { ok: true, value: input, literal: true };

  let source = input;
  const hadEquals = source.startsWith("=");
  if (hadEquals) source = source.slice(1);

  if (!/\{\{[\s\S]*?\}\}/.test(source)) {
    if (!hadEquals) return { ok: true, value: input, literal: true };
    try {
      return { ok: true, value: runSnippet(source, ctx), literal: false };
    } catch {
      return { ok: true, value: source, literal: true };
    }
  }

  const matches = [...source.matchAll(/\{\{([\s\S]*?)\}\}/g)];
  // Single expression filling the whole string → return the raw typed value.
  if (matches.length === 1 && matches[0][0].trim() === source.trim()) {
    try {
      return { ok: true, value: runSnippet(matches[0][1], ctx), literal: false };
    } catch (e) {
      return { ok: false, error: (e as Error).message, literal: false };
    }
  }

  try {
    const out = source.replace(/\{\{([\s\S]*?)\}\}/g, (_m, expr: string) => {
      const v = runSnippet(expr, ctx);
      if (v == null) return "";
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    });
    return { ok: true, value: out, literal: false };
  } catch (e) {
    return { ok: false, error: (e as Error).message, literal: false };
  }
}

export const EXPRESSION_HELPERS: Array<{ label: string; detail: string }> = [
  { label: "$json", detail: "Current item's JSON data" },
  { label: "$json.fieldName", detail: "A field on the current item" },
  { label: "$input.all()", detail: "All incoming items" },
  { label: "$input.first()", detail: "First incoming item" },
  { label: "$input.last()", detail: "Last incoming item" },
  { label: '$("Node Name").first()', detail: "First item output by another node" },
  { label: '$("Node Name").all()', detail: "All items output by another node" },
  { label: "$itemIndex", detail: "Index of the current item" },
  { label: "$now", detail: "Current date and time" },
  { label: "$now.toISOString()", detail: "Current timestamp as ISO string" },
  { label: "$now.plus(1, 'day')", detail: "Shift the current timestamp" },
  { label: "$today", detail: "Today at midnight" },
  { label: "$execution.id", detail: "Current execution id" },
  { label: "$execution.mode", detail: "Execution mode: manual | webhook | trigger" },
  { label: "$execution.resumeUrl", detail: "Webhook resume URL (Wait node)" },
  { label: "$workflow.id", detail: "Current workflow id" },
  { label: "$vars", detail: "Instance variables" },
  { label: "$env.VAR_NAME", detail: "Environment variable (allowlisted)" },
  { label: "$if(cond, a, b)", detail: "Inline conditional" },
  { label: "$jmespath(query, data?)", detail: "JMESPath query over data (defaults to $json)" },
  { label: "$isEmpty(value)", detail: "True when value is empty" },
];

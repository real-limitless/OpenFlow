import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

interface FieldAssignment {
  name?: string;
  type?: string;
  value?: unknown;
  stringValue?: unknown;
  numberValue?: unknown;
  booleanValue?: unknown;
  arrayValue?: unknown;
  objectValue?: unknown;
  [key: string]: unknown;
}

/** Maps wire type enums (both v3 and v3.3 assignment shapes) to coerce targets. */
const TYPE_MAP: Record<string, string> = {
  stringValue: "string",
  string: "string",
  numberValue: "number",
  number: "number",
  booleanValue: "boolean",
  boolean: "boolean",
  arrayValue: "array",
  array: "array",
  objectValue: "object",
  object: "object",
};

export const setExecutor: NodeExecutor = async (ctx) => {
  const items: INodeExecutionData[] = ensureItems(ctx.getInputItems(0));
  const params = ctx.getParams();

  if (isLegacyShape(params)) {
    return [items.map((item, idx) => runLegacy(ctx, item, idx))];
  }

  const mode = ctx.getParam<string>("mode", "manual");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const dotNotation = options.dotNotation !== false;
  const ignoreErrors = options.ignoreConversionErrors === true;

  const include = ctx.getParam<string>("include", "all");
  const includeOtherFields = ctx.getParam<boolean>("includeOtherFields", false);
  const includeFields = ctx.getParam<string>("includeFields", "");
  const excludeFields = ctx.getParam<string>("excludeFields", "");

  const fields = collectFields(ctx);

  if (mode === "raw") {
    const rawJson = ctx.getParam("jsonOutput");
    return [
      items.map((item, idx) => {
        const base = buildBase(item, include, includeOtherFields, includeFields, excludeFields);
        const merged = mergeRaw(base, rawJson, item, idx);
        return {
          json: merged,
          binary: item.binary,
          pairedItem: item.pairedItem ?? { item: idx, input: 0 },
        };
      }),
    ];
  }

  return [
    items.map((item, idx) => {
      const json = buildBase(item, include, includeOtherFields, includeFields, excludeFields);
      for (const field of fields) {
        const name = field.name;
        if (!name) continue;
        const typeKey = field.type ?? "stringValue";
        const rawValue = field[typeKey] ?? field.value;
        const resolved = resolveValue(rawValue, item, idx);
        const targetType = TYPE_MAP[typeKey] ?? "string";
        const coerced = coerceType(resolved, targetType, ignoreErrors);
        assignField(json, name, coerced, dotNotation);
      }
      return { json, binary: item.binary, pairedItem: item.pairedItem ?? { item: idx, input: 0 } };
    }),
  ];
};

/** Detects the legacy typeVersion 1–2 wire shape: `keepOnlySet` or `values.{string,number,boolean}` buckets. */
function isLegacyShape(params: Record<string, unknown>): boolean {
  if ("keepOnlySet" in params) return true;
  const values = params.values;
  if (values && typeof values === "object" && !Array.isArray(values)) {
    const v = values as Record<string, unknown>;
    return Array.isArray(v.string) || Array.isArray(v.number) || Array.isArray(v.boolean);
  }
  return false;
}

/** Collect field assignments from `assignments` (v3.3+) or `fields` (v3–3.2). */
function collectFields(ctx: Parameters<NodeExecutor>[0]): FieldAssignment[] {
  const assignmentsContainer = ctx.getParam<
    { assignments?: FieldAssignment[] } | FieldAssignment[] | undefined
  >("assignments");
  if (assignmentsContainer) {
    const arr = Array.isArray(assignmentsContainer)
      ? assignmentsContainer
      : (assignmentsContainer.assignments ?? []);
    if (arr.length > 0) return arr;
  }

  const fieldsContainer = ctx.getParam<
    { values?: FieldAssignment[] } | FieldAssignment[] | undefined
  >("fields");
  if (Array.isArray(fieldsContainer)) return fieldsContainer;
  return fieldsContainer?.values ?? [];
}

/** Build the output base object from the input item per include / keep-only rules. */
function buildBase(
  item: INodeExecutionData,
  include: string,
  includeOtherFields: boolean,
  includeFields: string,
  excludeFields: string,
): Record<string, unknown> {
  if (include === "none") return {};
  if (include === "selected") {
    const out: Record<string, unknown> = {};
    for (const n of parseFieldList(includeFields)) {
      if (n in item.json) out[n] = item.json[n];
    }
    return out;
  }
  if (include === "except") {
    const drop = new Set(parseFieldList(excludeFields));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item.json)) {
      if (!drop.has(k)) out[k] = v;
    }
    return out;
  }
  // include === "all" (default): keep input only when other fields requested.
  return includeOtherFields ? { ...item.json } : {};
}

function resolveValue(rawValue: unknown, item: INodeExecutionData, idx: number): unknown {
  if (typeof rawValue === "string") {
    const result = evaluateExpression(rawValue, { json: item.json, itemIndex: idx });
    if (result.ok) return result.value;
    return rawValue;
  }
  return rawValue;
}

function assignField(
  target: Record<string, unknown>,
  name: string,
  value: unknown,
  dotNotation: boolean,
): void {
  if (!dotNotation || !name.includes(".")) {
    target[name] = value;
    return;
  }
  const parts = name.split(".");
  let obj = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = obj[part];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      obj[part] = {};
    }
    obj = obj[part] as Record<string, unknown>;
  }
  obj[parts[parts.length - 1]] = value;
}

/** Merge evaluated JSON output onto the include-filtered base. */
function mergeRaw(
  base: Record<string, unknown>,
  rawJson: unknown,
  item: INodeExecutionData,
  idx: number,
): Record<string, unknown> {
  const text =
    typeof rawJson === "string" ? rawJson : rawJson == null ? "{}" : JSON.stringify(rawJson);

  const result = evaluateExpression(text, { json: item.json, itemIndex: idx });
  const interpolated = typeof result.value === "string" ? result.value : text;
  const parsed = safeParse(interpolated);

  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return { ...base, ...(parsed as Record<string, unknown>) };
  }
  return { ...base, value: parsed };
}

/** Legacy typeVersion 1–2 path: keepOnlySet + per-type value buckets. */
function runLegacy(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  idx: number,
): INodeExecutionData {
  const keepOnlySet = ctx.getParam<boolean>("keepOnlySet", false);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const dotNotation = options.dotNotation !== false;
  const json: Record<string, unknown> = keepOnlySet ? {} : { ...item.json };

  const valuesContainer = ctx.getParam<Record<string, FieldAssignment[]>>("values", {}) ?? {};
  const buckets: Array<[string, string]> = [
    ["string", "string"],
    ["number", "number"],
    ["boolean", "boolean"],
  ];
  for (const [bucket, targetType] of buckets) {
    for (const entry of valuesContainer[bucket] ?? []) {
      const name = entry.name;
      if (!name) continue;
      const resolved = resolveValue(entry.value, item, idx);
      const coerced = coerceType(resolved, targetType, false);
      assignField(json, name, coerced, dotNotation);
    }
  }

  return { json, binary: item.binary, pairedItem: item.pairedItem ?? { item: idx, input: 0 } };
}

function coerceType(value: unknown, targetType: string, ignoreErrors: boolean): unknown {
  switch (targetType) {
    case "number":
      if (typeof value === "number") return value;
      if (typeof value === "boolean") return value ? 1 : 0;
      if (typeof value === "string") {
        const n = Number(value);
        if (isNaN(n)) {
          if (ignoreErrors) return value;
          return 0;
        }
        return n;
      }
      return 0;
    case "boolean":
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value === "true" || value === "1";
      return Boolean(value);
    case "array":
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        const parsed = safeParse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      }
      return [value];
    case "object":
      if (typeof value === "object" && value !== null && !Array.isArray(value)) return value;
      if (typeof value === "string") {
        const parsed = safeParse(value);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? parsed
          : { raw: parsed };
      }
      return { raw: value };
    default:
      return value;
  }
}

function parseFieldList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
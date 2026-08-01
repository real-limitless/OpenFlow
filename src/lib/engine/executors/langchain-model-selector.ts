import type { NodeExecutor } from "@/sdk";
import { evaluateExpression } from "@/lib/expressions/evaluate";

interface ConditionRow {
  leftValue?: unknown;
  rightValue?: unknown;
  operator?: { type?: string; operation?: string };
}

interface Rule {
  conditions?: {
    combinator?: string;
    conditions?: ConditionRow[];
    options?: { version?: number; leftValue?: unknown; caseSensitive?: boolean; typeValidation?: string };
  };
  modelIndex?: number;
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("{{") || raw.startsWith("=")) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function toStr(v: unknown, ignoreCase: boolean): string {
  const s = v == null ? "" : String(v);
  return ignoreCase ? s.toLowerCase() : s;
}

function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function evaluateCondition(left: unknown, right: unknown, op: string, ignoreCase: boolean): boolean {
  const ops: Record<string, () => boolean> = {
    equals: () => {
      if (left === right) return true;
      if (typeof left === "string" || typeof right === "string") {
        return toStr(left, ignoreCase) === toStr(right, ignoreCase);
      }
      return false;
    },
    notEquals: () => !evaluateCondition(left, right, "equals", ignoreCase),
    contains: () => toStr(left, ignoreCase).includes(toStr(right, ignoreCase)),
    notContains: () => !toStr(left, ignoreCase).includes(toStr(right, ignoreCase)),
    startsWith: () => toStr(left, ignoreCase).startsWith(toStr(right, ignoreCase)),
    notStartsWith: () => !toStr(left, ignoreCase).startsWith(toStr(right, ignoreCase)),
    endsWith: () => toStr(left, ignoreCase).endsWith(toStr(right, ignoreCase)),
    notEndsWith: () => !toStr(left, ignoreCase).endsWith(toStr(right, ignoreCase)),
    isEmpty: () => left == null || left === "" || (Array.isArray(left) && left.length === 0),
    isNotEmpty: () => !(left == null || left === "" || (Array.isArray(left) && left.length === 0)),
    gt: () => asNumber(left) > asNumber(right),
    gte: () => asNumber(left) >= asNumber(right),
    lt: () => asNumber(left) < asNumber(right),
    lte: () => asNumber(left) <= asNumber(right),
    isTrue: () => Boolean(left) === true,
    isFalse: () => Boolean(left) === false,
    regex: () => {
      try {
        return new RegExp(String(right), ignoreCase ? "i" : "").test(String(left));
      } catch { return false; }
    },
    notRegex: () => {
      try {
        return !new RegExp(String(right), ignoreCase ? "i" : "").test(String(left));
      } catch { return false; }
    },
    after: () => new Date(typeof left === "string" ? left : String(left ?? "")).getTime() >
      new Date(typeof right === "string" ? right : String(right ?? "")).getTime(),
    before: () => new Date(typeof left === "string" ? left : String(left ?? "")).getTime() <
      new Date(typeof right === "string" ? right : String(right ?? "")).getTime(),
  };
  const normalized = (() => {
    switch (op) {
      case "equal": return "equals";
      case "notEqual": return "notEquals";
      case "larger": return "gt";
      case "smaller": return "lt";
      case "largerEqual": return "gte";
      case "smallerEqual": return "lte";
      default: return op;
    }
  })();
  return ops[normalized]?.() ?? false;
}

function matchesAll(conditions: ConditionRow[], itemJson: Record<string, unknown>, ignoreCase: boolean): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((c) => {
    const op = String((c.operator as { operation?: string })?.operation ?? c.operator ?? "equals");
    const left = resolveValue(c.leftValue, itemJson);
    const right = resolveValue(c.rightValue, itemJson);
    return evaluateCondition(left, right, op, ignoreCase);
  });
}

function matchesAny(conditions: ConditionRow[], itemJson: Record<string, unknown>, ignoreCase: boolean): boolean {
  if (conditions.length === 0) return true;
  return conditions.some((c) => {
    const op = String((c.operator as { operation?: string })?.operation ?? c.operator ?? "equals");
    const left = resolveValue(c.leftValue, itemJson);
    const right = resolveValue(c.rightValue, itemJson);
    return evaluateCondition(left, right, op, ignoreCase);
  });
}

export const langchainModelSelectorExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const numberInputs = ctx.getParam<number>("numberInputs", 0);
  const rulesParam = ctx.getParam<{ rule?: Rule[] }>("rules", {});

  if (!Number.isFinite(numberInputs) || numberInputs < 0) {
    throw new Error("Invalid configuration: numberInputs must be a non-negative integer");
  }

  const rules = rulesParam?.rule ?? [];
  if (rules.length === 0) {
    throw new Error("No matching rule found for the current input");
  }

  const firstItem = inputItems[0];
  const itemJson = firstItem?.json ?? {};

  for (const rule of rules) {
    const condContainer = rule.conditions;
    if (!condContainer) {
      continue;
    }

    const combinator = (condContainer.combinator ?? "and").toLowerCase();
    const conds = condContainer.conditions ?? [];
    const options = (condContainer.options as { caseSensitive?: boolean } | undefined) ?? {};
    const ignoreCase = options.caseSensitive ?? true;

    const matches = combinator === "or"
      ? matchesAny(conds, itemJson, ignoreCase)
      : matchesAll(conds, itemJson, ignoreCase);

    if (matches) {
      const modelIndex = rule.modelIndex ?? 0;
      if (modelIndex < 0 || modelIndex >= numberInputs) {
        throw new Error(`Configuration error: modelIndex ${modelIndex} is out of range (0..${numberInputs - 1})`);
      }
      const annotated = inputItems.map((item) => ({
        ...item,
        json: { ...item.json, selectedModelIndex: modelIndex },
      }));
      return [annotated];
    }
  }

  throw new Error("No matching rule found for the current input");
};

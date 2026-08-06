import { evaluateExpression } from "../expressions/evaluate";
import type { ExpressionContext } from "../expressions/evaluate";

export interface ConditionRow {
  leftValue?: unknown;
  rightValue?: unknown;
  operator?: unknown;
  operation?: string;
  value1?: unknown;
  value2?: unknown;
}

export type ConditionExprExtras = Pick<
  ExpressionContext,
  "vars" | "env" | "nodeData" | "allItems" | "envAllowlist"
>;

export function resolveConditionValue(
  raw: unknown,
  itemJson: Record<string, unknown>,
  extras?: ConditionExprExtras,
): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("{{") || raw.startsWith("=")) {
    const result = evaluateExpression(raw, {
      json: itemJson,
      vars: extras?.vars,
      env: extras?.env,
      nodeData: extras?.nodeData,
      allItems: extras?.allItems,
      envAllowlist: extras?.envAllowlist,
    });
    return result.ok ? result.value : raw;
  }
  return raw;
}

export function normalizeOperator(op: unknown): string {
  if (op && typeof op === "object") {
    const obj = op as { operation?: unknown; type?: unknown };
    op = obj.operation ?? obj.type;
  }
  const s = String(op ?? "");
  switch (s) {
    case "equal":
      return "equals";
    case "notEqual":
      return "notEquals";
    case "larger":
      return "gt";
    case "smaller":
      return "lt";
    case "largerEqual":
      return "gte";
    case "smallerEqual":
      return "lte";
    case "true":
      return "isTrue";
    case "false":
      return "isFalse";
    case "empty":
      return "isEmpty";
    case "notEmpty":
      return "isNotEmpty";
    default:
      return s;
  }
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

function dateMs(v: unknown): number {
  const t = new Date(typeof v === "string" ? v : String(v ?? "")).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function isEmptyValue(v: unknown): boolean {
  if (v == null || v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) {
    return true;
  }
  return false;
}

/** Empty needle must not match every string (`"".includes("")` / startsWith/endsWith). */
function hasNonEmptyNeedle(right: unknown): boolean {
  return right != null && String(right) !== "";
}

function isTruthy(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  return false;
}

function isFalsy(v: unknown): boolean {
  if (typeof v === "boolean") return !v;
  if (typeof v === "number") return v === 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "false" || s === "0" || s === "no" || s === "";
  }
  return v == null;
}

export function evaluateCondition(
  left: unknown,
  right: unknown,
  op: string,
  ignoreCase: boolean,
): boolean {
  switch (op) {
    case "equals": {
      if (left === right) return true;
      // null/undefined must not coerce to "" (missing field == "" was always true)
      if (left == null || right == null) return false;
      if (typeof left === "string" || typeof right === "string") {
        return toStr(left, ignoreCase) === toStr(right, ignoreCase);
      }
      return false;
    }
    case "notEquals":
      return !evaluateCondition(left, right, "equals", ignoreCase);
    case "contains":
      if (!hasNonEmptyNeedle(right)) return false;
      return toStr(left, ignoreCase).includes(toStr(right, ignoreCase));
    case "notContains":
      if (!hasNonEmptyNeedle(right)) return true;
      return !toStr(left, ignoreCase).includes(toStr(right, ignoreCase));
    case "startsWith":
      if (!hasNonEmptyNeedle(right)) return false;
      return toStr(left, ignoreCase).startsWith(toStr(right, ignoreCase));
    case "notStartsWith":
      if (!hasNonEmptyNeedle(right)) return true;
      return !toStr(left, ignoreCase).startsWith(toStr(right, ignoreCase));
    case "endsWith":
      if (!hasNonEmptyNeedle(right)) return false;
      return toStr(left, ignoreCase).endsWith(toStr(right, ignoreCase));
    case "notEndsWith":
      if (!hasNonEmptyNeedle(right)) return true;
      return !toStr(left, ignoreCase).endsWith(toStr(right, ignoreCase));
    case "isEmpty":
      return isEmptyValue(left);
    case "isNotEmpty":
      return !isEmptyValue(left);
    case "exists":
      return left !== undefined;
    case "notExists":
      return left === undefined;
    case "gt":
      return asNumber(left) > asNumber(right);
    case "gte":
      return asNumber(left) >= asNumber(right);
    case "lt":
      return asNumber(left) < asNumber(right);
    case "lte":
      return asNumber(left) <= asNumber(right);
    case "isTrue":
      return isTruthy(left);
    case "isFalse":
      return isFalsy(left);
    case "regex": {
      try {
        return new RegExp(String(right ?? ""), ignoreCase ? "i" : "").test(String(left ?? ""));
      } catch {
        return false;
      }
    }
    case "notRegex": {
      try {
        return !new RegExp(String(right ?? ""), ignoreCase ? "i" : "").test(String(left ?? ""));
      } catch {
        return false;
      }
    }
    case "after":
      return dateMs(left) > dateMs(right);
    case "before":
      return dateMs(left) < dateMs(right);
    case "afterOrEqual":
      return dateMs(left) >= dateMs(right);
    case "beforeOrEqual":
      return dateMs(left) <= dateMs(right);
    default:
      return false;
  }
}

export function evaluateConditionRow(
  row: ConditionRow,
  itemJson: Record<string, unknown>,
  ignoreCase: boolean,
  extras?: ConditionExprExtras,
): boolean {
  const left = resolveConditionValue(row.leftValue ?? row.value1, itemJson, extras);
  const right = resolveConditionValue(row.rightValue ?? row.value2, itemJson, extras);
  const op = normalizeOperator(row.operator ?? row.operation);
  return evaluateCondition(left, right, op, ignoreCase);
}

export function combineConditionResults(
  results: boolean[],
  combinator: string,
): boolean {
  if (results.length === 0) return false;
  const c = combinator.toLowerCase();
  if (c === "or" || c === "any") return results.some(Boolean);
  return results.every(Boolean);
}

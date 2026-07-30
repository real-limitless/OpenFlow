import type { NodeExecutor } from "../types";
import type { INodeExecutionData } from "../../workflow/types";
import { evaluateExpression } from "../../expressions/evaluate";

interface ConditionRow {
  leftValue?: unknown;
  rightValue?: unknown;
  operator?: unknown;
  operation?: string;
  value1?: unknown;
  value2?: unknown;
}

interface ConditionsContainer {
  conditions?: ConditionRow[];
  combinator?: string;
  number?: ConditionRow[];
  string?: ConditionRow[];
  boolean?: ConditionRow[];
  dateTime?: ConditionRow[];
  object?: ConditionRow[];
  array?: ConditionRow[];
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("{{") || raw.startsWith("=")) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function normalizeOperator(op: unknown): string {
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

function evaluateCondition(
  left: unknown,
  right: unknown,
  op: string,
  ignoreCase: boolean,
): boolean {
  switch (op) {
    case "equals":
      if (left === right) return true;
      if (typeof left === "string" || typeof right === "string") {
        return toStr(left, ignoreCase) === toStr(right, ignoreCase);
      }
      return false;
    case "notEquals":
      return !evaluateCondition(left, right, "equals", ignoreCase);
    case "contains":
      return toStr(left, ignoreCase).includes(toStr(right, ignoreCase));
    case "notContains":
      return !toStr(left, ignoreCase).includes(toStr(right, ignoreCase));
    case "startsWith":
      return toStr(left, ignoreCase).startsWith(toStr(right, ignoreCase));
    case "notStartsWith":
      return !toStr(left, ignoreCase).startsWith(toStr(right, ignoreCase));
    case "endsWith":
      return toStr(left, ignoreCase).endsWith(toStr(right, ignoreCase));
    case "notEndsWith":
      return !toStr(left, ignoreCase).endsWith(toStr(right, ignoreCase));
    case "isEmpty":
      return left == null || left === "" || (Array.isArray(left) && left.length === 0);
    case "isNotEmpty":
      return !(left == null || left === "" || (Array.isArray(left) && left.length === 0));
    case "gt":
      return asNumber(left) > asNumber(right);
    case "gte":
      return asNumber(left) >= asNumber(right);
    case "lt":
      return asNumber(left) < asNumber(right);
    case "lte":
      return asNumber(left) <= asNumber(right);
    case "isTrue":
      return Boolean(left) === true;
    case "isFalse":
      return Boolean(left) === false;
    case "regex": {
      try {
        return new RegExp(String(right), ignoreCase ? "i" : "").test(String(left));
      } catch {
        return false;
      }
    }
    case "notRegex": {
      try {
        return !new RegExp(String(right), ignoreCase ? "i" : "").test(String(left));
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

function extractV1Rows(container: ConditionsContainer): ConditionRow[] {
  const rows: ConditionRow[] = [];
  for (const key of ["number", "string", "boolean", "dateTime", "object", "array"] as const) {
    const arr = container[key];
    if (Array.isArray(arr)) {
      for (const row of arr) rows.push(row);
    }
  }
  return rows;
}

export const ifExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);

  const condContainer = node.parameters.conditions as
    ConditionsContainer | ConditionRow[] | undefined;

  let rawRows: ConditionRow[];
  let nestedCombinator: string | undefined;

  if (Array.isArray(condContainer)) {
    rawRows = condContainer;
  } else if (condContainer) {
    nestedCombinator = condContainer.combinator;
    if (condContainer.conditions && condContainer.conditions.length > 0) {
      rawRows = condContainer.conditions;
    } else {
      rawRows = extractV1Rows(condContainer);
    }
  } else {
    rawRows = [];
  }

  const conditions = rawRows.map((row) => ({
    leftValue: row.leftValue ?? row.value1,
    rightValue: row.rightValue ?? row.value2,
    operator: normalizeOperator(row.operator ?? row.operation),
  }));

  const nestedComb = nestedCombinator;
  const topCombinator = node.parameters.combinator as string | undefined;
  const v1Combine = node.parameters.combineOperation as string | undefined;
  const combinatorRaw = String(nestedComb ?? topCombinator ?? v1Combine ?? "and").toLowerCase();
  const combinator = combinatorRaw === "or" || combinatorRaw === "any" ? "or" : "and";

  const options = (node.parameters.options as { ignoreCase?: boolean } | undefined) ?? {};
  const ignoreCase = options.ignoreCase ?? true;
  // TODO(spec): looseTypeValidation (top-level @version>=2.1 / options @version<2.1) is partial —
  // current path is forgiving (string fallback for equals, Number() coercion for math ops).

  const trueItems: INodeExecutionData[] = [];
  const falseItems: INodeExecutionData[] = [];

  if (conditions.length === 0) {
    return [trueItems, inputItems.slice()];
  }

  for (const item of inputItems) {
    const results = conditions.map((cond) => {
      const left = resolveValue(cond.leftValue, item.json);
      const right = resolveValue(cond.rightValue, item.json);
      return evaluateCondition(left, right, cond.operator, ignoreCase);
    });

    const passes = combinator === "and" ? results.every(Boolean) : results.some(Boolean);

    if (passes) {
      trueItems.push(item);
    } else {
      falseItems.push(item);
    }
  }

  return [trueItems, falseItems];
};

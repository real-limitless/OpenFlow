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
}

interface RoutingRule {
  conditions?: ConditionsContainer;
  renameOutput?: boolean;
  outputName?: string;
  outputKey?: string;
  leftValue?: unknown;
  rightValue?: unknown;
  operator?: unknown;
  operation?: string;
}

interface RulesContainer {
  rules?: RoutingRule[];
  values?: RoutingRule[];
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
    case "exists":
      return left != null;
    case "notExists":
      return left == null;
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

function evalRuleConditions(
  rule: RoutingRule,
  itemJson: Record<string, unknown>,
  ignoreCase: boolean,
): boolean {
  const container = rule.conditions;
  let rows: ConditionRow[] = [];
  let combinator = "and";

  if (container) {
    combinator = String(container.combinator ?? "and").toLowerCase();
    rows = container.conditions ?? [];
  } else if (rule.leftValue !== undefined || rule.rightValue !== undefined) {
    rows = [
      {
        leftValue: rule.leftValue,
        rightValue: rule.rightValue,
        operator: rule.operator,
        operation: rule.operation,
      },
    ];
  }

  if (rows.length === 0) return false;

  const isOr = combinator === "or" || combinator === "any";
  const results = rows.map((row) => {
    const left = resolveValue(row.leftValue ?? row.value1, itemJson);
    const right = resolveValue(row.rightValue ?? row.value2, itemJson);
    const op = normalizeOperator(row.operator ?? row.operation);
    return evaluateCondition(left, right, op, ignoreCase);
  });

  return isOr ? results.some(Boolean) : results.every(Boolean);
}

export const switchExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const mode = (node.parameters.mode as string) ?? "rules";
  const options = (node.parameters.options as Record<string, unknown>) ?? {};
  const ignoreCase = options.ignoreCase ?? true;
  const allMatchingOutputs = options.allMatchingOutputs === true;

  const fallbackOutput = String(
    node.parameters.fallbackOutput ?? options.fallbackOutput ?? "none",
  );

  if (mode === "expression") {
    const numberOutputs = Math.max(1, Number(node.parameters.numberOutputs ?? 1));
    const outputExpr = (node.parameters.output as string) ?? "={{ 0 }}";
    const outputs: INodeExecutionData[][] = Array.from({ length: numberOutputs }, () => []);

    for (const item of inputItems) {
      const result = evaluateExpression(outputExpr, { json: item.json });
      const idx = result.ok && typeof result.value === "number" ? result.value : NaN;
      if (Number.isInteger(idx) && idx >= 0 && idx < numberOutputs) {
        outputs[idx].push(item);
      }
    }

    return outputs;
  }

  const rulesContainer = node.parameters.rules as RulesContainer | undefined;
  const rules = rulesContainer?.rules ?? rulesContainer?.values ?? [];

  const ruleCount = Math.max(1, rules.length);
  const hasExtra = fallbackOutput === "extra";
  const totalOutputs = ruleCount + (hasExtra ? 1 : 0);
  const outputs: INodeExecutionData[][] = Array.from({ length: totalOutputs }, () => []);

  for (const item of inputItems) {
    let matched = false;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const passes = evalRuleConditions(rule, item.json, ignoreCase);
      if (passes) {
        outputs[i].push(item);
        matched = true;
        if (!allMatchingOutputs) break;
      }
    }
    if (!matched) {
      if (fallbackOutput === "extra") {
        outputs[totalOutputs - 1].push(item);
      } else if (fallbackOutput === "first") {
        outputs[0].push(item);
      }
    }
  }

  return outputs;
};
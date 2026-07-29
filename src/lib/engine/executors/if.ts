import type { NodeExecutor } from "../types";
import { evaluateExpression } from "../../expressions/evaluate";
import type { INodeExecutionData } from "../../workflow/types";

function evaluateCondition(left: unknown, right: unknown, operation: string): boolean {
  switch (operation) {
    case "equals": return left === right;
    case "notEquals": return left !== right;
    case "contains": return String(left).includes(String(right));
    case "notContains": return !String(left).includes(String(right));
    case "startsWith": return String(left).startsWith(String(right));
    case "endsWith": return String(left).endsWith(String(right));
    case "isEmpty": return left == null || left === "";
    case "isNotEmpty": return left != null && left !== "";
    case "gt": return Number(left) > Number(right);
    case "lt": return Number(left) < Number(right);
    case "isTrue": return Boolean(left) === true;
    case "isFalse": return Boolean(left) === false;
    default: return false;
  }
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("{{") || raw.startsWith("=")) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

interface Condition {
  leftValue: string;
  rightValue: string;
  operator: string;
}

export const ifExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);

  const condContainer = node.parameters.conditions as
    | { conditions?: Condition[] }
    | Condition[]
    | undefined;

  const conditions: Condition[] = Array.isArray(condContainer)
    ? condContainer
    : condContainer?.conditions ?? [];

  const combinator = (node.parameters.combinator as string) ?? "and";

  const trueItems: INodeExecutionData[] = [];
  const falseItems: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const results = conditions.map((cond) => {
      const left = resolveValue(cond.leftValue, item.json);
      const right = resolveValue(cond.rightValue, item.json);
      return evaluateCondition(left, right, cond.operator);
    });

    const passes = combinator === "and"
      ? results.every(Boolean)
      : results.some(Boolean);

    if (passes) {
      trueItems.push(item);
    } else {
      falseItems.push(item);
    }
  }

  return [trueItems, falseItems];
};

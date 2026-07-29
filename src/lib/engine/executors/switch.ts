import type { NodeExecutor } from "../types";
import type { INodeExecutionData } from "../../workflow/types";
import { evaluateExpression } from "../../expressions/evaluate";

interface SwitchRule {
  leftValue: string;
  operator: { type: string; operation: string } | string;
  rightValue: string;
  outputKey?: string;
}

function evalCondition(left: unknown, right: unknown, operation: string): boolean {
  switch (operation) {
    case "equals":
      return left === right;
    case "notEquals":
      return left !== right;
    case "contains":
      return String(left).includes(String(right));
    case "gt":
      return Number(left) > Number(right);
    case "lt":
      return Number(left) < Number(right);
    case "gte":
      return Number(left) >= Number(right);
    case "lte":
      return Number(left) <= Number(right);
    case "startsWith":
      return String(left).startsWith(String(right));
    case "endsWith":
      return String(left).endsWith(String(right));
    case "regex":
      return new RegExp(String(right)).test(String(left));
    default:
      return false;
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

export const switchExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const mode = (node.parameters.mode as string) ?? "rules";
  const options = (node.parameters.options as Record<string, unknown>) ?? {};
  const fallbackOutput = (options.fallbackOutput as string) ?? "none";

  const rulesContainer = node.parameters.rules as { values?: SwitchRule[] } | undefined;
  const rules = rulesContainer?.values ?? [];
  const outputCount = rules.length > 0 ? rules.length : 1;
  const hasFallback = fallbackOutput === "extra";
  const totalOutputs = outputCount + (hasFallback ? 1 : 0);

  const outputs: INodeExecutionData[][] = Array.from({ length: totalOutputs }, () => []);

  if (mode === "expression") {
    const outputExpr = (node.parameters.output as string) ?? "={{ 0 }}";
    for (const item of inputItems) {
      const result = evaluateExpression(outputExpr, { json: item.json });
      const idx = result.ok && typeof result.value === "number" ? result.value : 0;
      if (idx >= 0 && idx < totalOutputs) {
        outputs[idx].push(item);
      } else if (hasFallback) {
        outputs[totalOutputs - 1].push(item);
      }
    }
  } else {
    for (const item of inputItems) {
      let matched = false;
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const left = resolveValue(rule.leftValue, item.json);
        const right = resolveValue(rule.rightValue, item.json);
        const operation =
          typeof rule.operator === "string"
            ? rule.operator
            : (rule.operator?.operation ?? "equals");
        if (evalCondition(left, right, operation)) {
          outputs[i].push(item);
          matched = true;
          break;
        }
      }
      if (!matched && hasFallback) {
        outputs[totalOutputs - 1].push(item);
      }
    }
  }

  return outputs;
};

import type { NodeExecutor } from "../types";
import type { INodeExecutionData } from "../../workflow/types";
import { evaluateExpression } from "../../expressions/evaluate";
import {
  type ConditionRow,
  combineConditionResults,
  evaluateConditionRow,
} from "../conditions";

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

  const results = rows.map((row) => evaluateConditionRow(row, itemJson, ignoreCase));
  return combineConditionResults(results, combinator);
}

export const switchExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const mode = (node.parameters.mode as string) ?? "rules";
  const options = (node.parameters.options as Record<string, unknown>) ?? {};
  const ignoreCase = options.ignoreCase !== false;
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
      const passes = evalRuleConditions(rule, item.json, Boolean(ignoreCase));
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

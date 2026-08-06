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

export const filterExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const mode = (node.parameters.mode as string) ?? "manual";

  const exprExtras = {
    vars: ctx.vars,
    env:
      typeof process !== "undefined"
        ? (process.env as Record<string, string>)
        : undefined,
  };

  if (mode === "expression") {
    const expr = (node.parameters.expression as string) ?? "";
    const output: INodeExecutionData[] = [];
    for (const item of inputItems) {
      const result = evaluateExpression(expr, { json: item.json, ...exprExtras });
      if (result.ok && result.value) output.push(item);
    }
    return [output];
  }

  const condContainer = node.parameters.conditions as
    | ConditionsContainer
    | ConditionRow[]
    | undefined;
  const rawRows: ConditionRow[] = Array.isArray(condContainer)
    ? condContainer
    : (condContainer?.conditions ?? []);

  const nestedCombinator = Array.isArray(condContainer) ? undefined : condContainer?.combinator;
  const topCombinator = node.parameters.combinator as string | undefined;
  const v1Combine = node.parameters.combineConditions as string | undefined;
  const combinator = String(nestedCombinator ?? topCombinator ?? v1Combine ?? "and").toLowerCase();

  const options = (node.parameters.options as { ignoreCase?: boolean } | undefined) ?? {};
  const ignoreCase = options.ignoreCase ?? true;

  const output: INodeExecutionData[] = [];

  for (const item of inputItems) {
    // Filter with no conditions keeps all items (documented filter default)
    if (rawRows.length === 0) {
      output.push(item);
      continue;
    }
    const results = rawRows.map((row) =>
      evaluateConditionRow(row, item.json, ignoreCase, exprExtras),
    );
    if (combineConditionResults(results, combinator)) output.push(item);
  }

  return [output];
};

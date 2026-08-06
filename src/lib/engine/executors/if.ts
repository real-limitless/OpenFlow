import type { NodeExecutor } from "../types";
import type { INodeExecutionData } from "../../workflow/types";
import {
  type ConditionRow,
  combineConditionResults,
  evaluateConditionRow,
} from "../conditions";

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
    | ConditionsContainer
    | ConditionRow[]
    | undefined;

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

  const nestedComb = nestedCombinator;
  const topCombinator = node.parameters.combinator as string | undefined;
  const v1Combine = node.parameters.combineOperation as string | undefined;
  const combinator = String(nestedComb ?? topCombinator ?? v1Combine ?? "and").toLowerCase();

  const options = (node.parameters.options as { ignoreCase?: boolean } | undefined) ?? {};
  const ignoreCase = options.ignoreCase ?? true;

  const trueItems: INodeExecutionData[] = [];
  const falseItems: INodeExecutionData[] = [];

  if (rawRows.length === 0) {
    return [trueItems, inputItems.slice()];
  }

  for (const item of inputItems) {
    const results = rawRows.map((row) => evaluateConditionRow(row, item.json, ignoreCase));
    const passes = combineConditionResults(results, combinator);

    if (passes) {
      trueItems.push(item);
    } else {
      falseItems.push(item);
    }
  }

  return [trueItems, falseItems];
};

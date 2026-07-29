import type { NodeExecutor, INodeExecutionData } from "@/sdk";

/**
 * Legacy Item Lists node — public docs folded most ops into Split Out / Aggregate.
 * OpenFlow keeps splitOut + aggregate modes for import compatibility.
 */

function getField(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export const itemListsExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("mode", "splitOutItems");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const ignoreMissingFields = options.ignoreMissingFields === true;

  if (mode === "aggregateItems" || mode === "aggregate") {
    const fieldName =
      ctx.getParam<string>("fieldName", "") ||
      ctx.getParam<string>("destinationFieldName", "data") ||
      "data";
    const data = inputItems.map((item) => item.json);
    return [[{ json: { [fieldName]: data } }]];
  }

  // splitOutItems / splitOut
  const arrayFieldName =
    ctx.getParam<string>("arrayFieldName", "") ||
    ctx.getParam<string>("fieldToSplitOut", "data") ||
    "data";
  const output: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const value = getField(item.json, arrayFieldName);

    if (!Array.isArray(value)) {
      if (ignoreMissingFields) continue;
      output.push({ json: { ...item.json }, pairedItem: item.pairedItem });
      continue;
    }

    for (const element of value) {
      if (element && typeof element === "object" && !Array.isArray(element)) {
        output.push({
          json: { ...(element as Record<string, unknown>) },
          pairedItem: item.pairedItem,
        });
      } else {
        output.push({
          json: { value: element },
          pairedItem: item.pairedItem,
        });
      }
    }
  }

  return [output];
};

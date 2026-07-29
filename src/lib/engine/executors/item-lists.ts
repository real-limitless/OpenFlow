import type { NodeExecutor } from "../types";
import type { INodeExecutionData } from "../../workflow/types";

function getField(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export const itemListsExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const mode = (node.parameters.mode as string) ?? "splitOut";
  const options = (node.parameters.options as Record<string, unknown>) ?? {};
  const ignoreMissingFields = options.ignoreMissingFields === true;

  if (mode === "aggregate") {
    const fieldName = (node.parameters.fieldName as string) ?? "data";
    const data = inputItems.map((item) => item.json);
    return [[{ json: { [fieldName]: data } }]];
  }

  // splitOut
  const arrayFieldName = (node.parameters.arrayFieldName as string) ?? "data";
  const output: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const value = getField(item.json, arrayFieldName);

    if (!Array.isArray(value)) {
      if (ignoreMissingFields) continue;
      output.push({ json: { ...item.json } });
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

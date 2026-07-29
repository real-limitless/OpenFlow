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

export const splitOutExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const fieldToSplitOut = (node.parameters.fieldToSplitOut as string) ?? "";
  const includePrefix = node.parameters.includePrefix === true;
  const destinationPrefix = (node.parameters.destinationPrefix as string) ?? "";
  const options = (node.parameters.options as Record<string, unknown>) ?? {};
  const ignoreMissingFields = options.ignoreMissingFields === true;

  const output: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const value = getField(item.json, fieldToSplitOut);

    if (!Array.isArray(value)) {
      if (ignoreMissingFields) continue;
      output.push({ json: { ...item.json } });
      continue;
    }

    for (const element of value) {
      if (element && typeof element === "object" && !Array.isArray(element)) {
        const elementObj = element as Record<string, unknown>;
        if (includePrefix && destinationPrefix) {
          output.push({
            json: { [destinationPrefix]: elementObj },
            pairedItem: item.pairedItem,
          });
        } else {
          output.push({ json: { ...elementObj }, pairedItem: item.pairedItem });
        }
      } else {
        const key = destinationPrefix || fieldToSplitOut.split(".").pop() || "value";
        output.push({
          json: includePrefix ? { [key]: element } : { [key]: element },
          pairedItem: item.pairedItem,
        });
      }
    }
  }

  return [output];
};

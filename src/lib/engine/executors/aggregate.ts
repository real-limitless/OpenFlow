import type { NodeExecutor } from "../types";
import type { INodeExecutionData } from "../../workflow/types";

interface FieldEntry {
  fieldToAggregate?: string;
}

export const aggregateExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const mode = (node.parameters.aggregate as string) ?? "allFields";
  const destinationFieldName = (node.parameters.destinationFieldName as string) ?? "data";
  const options = (node.parameters.options as Record<string, unknown>) ?? {};
  const includeItemData = options.includeItemData === true;

  if (mode === "individualFields") {
    const includeContainer = node.parameters.includeFields as { fields?: FieldEntry[] } | undefined;
    const fields = includeContainer?.fields ?? [];
    const fieldNames = fields
      .map((f) => f.fieldToAggregate)
      .filter((n): n is string => typeof n === "string" && n.length > 0);

    const aggregated: Record<string, unknown[]> = {};
    for (const name of fieldNames) {
      aggregated[name] = inputItems.map((item) => item.json[name]);
    }

    if (includeItemData) {
      aggregated[destinationFieldName] = inputItems.map((item) => item.json) as unknown[];
    }

    return [[{ json: aggregated }]];
  }

  // allFields
  const data = inputItems.map((item) => item.json);
  return [[{ json: { [destinationFieldName]: data } }]];
};

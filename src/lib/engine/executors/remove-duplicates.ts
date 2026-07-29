import type { NodeExecutor } from "../types";
import type { INodeExecutionData } from "../../workflow/types";

interface FieldEntry {
  fieldName?: string;
}

function normalize(value: unknown, caseInsensitive: boolean, trim: boolean): string {
  let v = value;
  if (typeof v === "string") {
    if (trim) v = v.trim();
    if (caseInsensitive) v = (v as string).toLowerCase();
  }
  return JSON.stringify(v);
}

export const removeDuplicatesExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const compare = (node.parameters.compare as string) ?? "allFields";
  const options = (node.parameters.options as Record<string, unknown>) ?? {};
  const caseInsensitive = options.caseInsensitive === true;
  const trimValues = options.trimValues === true;

  const fieldsContainer = node.parameters.fieldsToMatch as { fields?: FieldEntry[] } | undefined;
  const fieldNames = (fieldsContainer?.fields ?? [])
    .map((f) => f.fieldName)
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  const keyOf = (json: Record<string, unknown>): string => {
    if (compare === "selectedFields") {
      return fieldNames.map((f) => normalize(json[f], caseInsensitive, trimValues)).join("\u0000");
    }
    return normalize(json, caseInsensitive, trimValues);
  };

  const seen = new Set<string>();
  const output: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const key = keyOf(item.json);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return [output];
};

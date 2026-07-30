import type { NodeExecutor, INodeExecutionData } from "@/sdk";

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

export const removeDuplicatesExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  // Modern docs use operation; OpenFlow/legacy use compare
  const operation = ctx.getParam<string>("operation", "removeItemsRepeatedInCurrentInput");
  const compare = ctx.getParam<string>("compare", "allFields");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const caseInsensitive = options.caseInsensitive === true;
  const trimValues = options.trimValues === true;
  const removeOtherFields = options.removeOtherFields === true;

  // Cross-execution history ops are not implemented in OpenFlow v1
  if (
    operation === "removeItemsProcessedInPreviousExecutions" ||
    operation === "clearDeduplicationHistory"
  ) {
    // Pass through with notice field
    return [
      inputItems.map((item) => ({
        json: {
          ...item.json,
          __openflowNotice:
            "Cross-execution dedupe is not implemented; items passed through unchanged.",
        },
        pairedItem: item.pairedItem,
      })),
    ];
  }

  const fieldsContainer = ctx.getParam<{ fields?: FieldEntry[] }>("fieldsToMatch", {});
  const fieldNamesFromCollection = (fieldsContainer?.fields ?? [])
    .map((f) => f.fieldName)
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  const fieldsToCompare = (
    ctx.getParam<string>("fieldsToCompare", "") ||
    ctx.getParam<string>("fieldsToExclude", "") ||
    ""
  )
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const selectedFields =
    fieldNamesFromCollection.length > 0 ? fieldNamesFromCollection : fieldsToCompare;

  const keyOf = (json: Record<string, unknown>): string => {
    if (compare === "selectedFields" || compare === "selected") {
      return selectedFields
        .map((f) => normalize(json[f], caseInsensitive, trimValues))
        .join("\u0000");
    }
    if (compare === "allFieldsExcept" || compare === "except") {
      const exclude = new Set(selectedFields);
      const keys = Object.keys(json)
        .filter((k) => !exclude.has(k))
        .sort();
      return keys.map((k) => normalize(json[k], caseInsensitive, trimValues)).join("\u0000");
    }
    return normalize(json, caseInsensitive, trimValues);
  };

  const seen = new Set<string>();
  const output: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const key = keyOf(item.json);
    if (seen.has(key)) continue;
    seen.add(key);

    if (removeOtherFields && selectedFields.length > 0) {
      const slim: Record<string, unknown> = {};
      for (const f of selectedFields) {
        if (f in item.json) slim[f] = item.json[f];
      }
      output.push({ json: slim, pairedItem: item.pairedItem });
    } else {
      output.push(item);
    }
  }

  return [output];
};

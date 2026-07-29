import type { NodeExecutor, INodeExecutionData } from "@/sdk";

function getField(obj: Record<string, unknown>, path: string, useDot = true): unknown {
  if (!useDot) return obj[path];
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export const splitOutExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const fieldToSplitOut = ctx.getParam<string>("fieldToSplitOut", "") ?? "";
  const include = ctx.getParam<string>("include", "noOtherFields");
  // Legacy boolean from earlier OpenFlow defs
  const includePrefix = ctx.getParam<boolean>("includePrefix", false) === true;
  const destinationFieldName =
    ctx.getParam<string>("destinationFieldName", "") ||
    ctx.getParam<string>("destinationPrefix", "") ||
    "";
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const ignoreMissingFields = options.ignoreMissingFields === true;
  const disableDotNotation = options.disableDotNotation === true;
  const fieldsToIncludeRaw = ctx.getParam<string>("fieldsToInclude", "") ?? "";
  const fieldsToInclude = fieldsToIncludeRaw
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const output: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const value = getField(item.json, fieldToSplitOut, !disableDotNotation);

    if (!Array.isArray(value)) {
      if (ignoreMissingFields) continue;
      output.push({ json: { ...item.json }, pairedItem: item.pairedItem });
      continue;
    }

    for (const element of value) {
      let base: Record<string, unknown> = {};

      if (include === "allOtherFields" || include === "all") {
        base = { ...item.json };
        // remove the split field from base when possible
        if (!disableDotNotation && !fieldToSplitOut.includes(".")) {
          delete base[fieldToSplitOut];
        }
      } else if (include === "selectedOtherFields" || include === "selected") {
        for (const f of fieldsToInclude) {
          if (f in item.json) base[f] = item.json[f];
        }
      }

      if (element && typeof element === "object" && !Array.isArray(element)) {
        const elementObj = element as Record<string, unknown>;
        if (destinationFieldName) {
          output.push({
            json: { ...base, [destinationFieldName]: elementObj },
            pairedItem: item.pairedItem,
            binary: item.binary,
          });
        } else if (includePrefix && destinationFieldName) {
          output.push({
            json: { ...base, [destinationFieldName]: elementObj },
            pairedItem: item.pairedItem,
            binary: item.binary,
          });
        } else {
          output.push({
            json: { ...base, ...elementObj },
            pairedItem: item.pairedItem,
            binary: item.binary,
          });
        }
      } else {
        const key =
          destinationFieldName || fieldToSplitOut.split(".").pop() || "value";
        output.push({
          json: { ...base, [key]: element },
          pairedItem: item.pairedItem,
          binary: item.binary,
        });
      }
    }
  }

  return [output];
};

import type { NodeExecutor, INodeExecutionData } from "@/sdk";

function getField(obj: Record<string, unknown>, path: string, useDot: boolean): unknown {
  if (!useDot) return obj[path];
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function leafName(path: string): string {
  return path.split(".").pop() ?? path;
}

function firstSegment(path: string): string {
  return path.split(".")[0] ?? path;
}

export const splitOutExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const fieldToSplitOutRaw = ctx.getParam<string>("fieldToSplitOut", "") ?? "";
  const include = ctx.getParam<string>("include", "noOtherFields");
  const fieldsToIncludeRaw = ctx.getParam<string>("fieldsToInclude", "") ?? "";
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const disableDotNotation = options.disableDotNotation === true;
  const destinationFieldName = (options.destinationFieldName as string | undefined) ?? "";
  const includeBinary = options.includeBinary === true;

  const fields = fieldToSplitOutRaw
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const fieldsToInclude = fieldsToIncludeRaw
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const output: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const json = item.json as Record<string, unknown>;

    for (const field of fields) {
      const value = getField(json, field, !disableDotNotation);
      if (!Array.isArray(value)) continue;

      for (const element of value) {
        let base: Record<string, unknown> = {};

        if (include === "allOtherFields") {
          base = { ...json };
          delete base[firstSegment(field)];
        } else if (include === "selectedOtherFields") {
          for (const f of fieldsToInclude) {
            if (disableDotNotation) {
              if (f in json) base[f] = json[f];
            } else {
              const v = getField(json, f, true);
              if (v !== undefined) base[leafName(f)] = v;
            }
          }
        }

        const outItem: INodeExecutionData = {
          json: {},
          pairedItem: item.pairedItem,
        };

        if (element && typeof element === "object" && !Array.isArray(element)) {
          const elementObj = element as Record<string, unknown>;
          if (destinationFieldName) {
            outItem.json = { ...base, [destinationFieldName]: elementObj };
          } else {
            outItem.json = { ...base, ...elementObj };
          }
        } else {
          const key = destinationFieldName || leafName(field);
          outItem.json = { ...base, [key]: element };
        }

        if (includeBinary && item.binary) {
          outItem.binary = item.binary;
        }

        output.push(outItem);
      }
    }
  }

  return [output];
};

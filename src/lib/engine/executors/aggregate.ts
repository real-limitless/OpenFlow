import type { NodeExecutor } from "@/sdk";

interface FieldEntry {
  fieldToAggregate?: string;
  renameField?: boolean;
  outputFieldName?: string;
}

export const aggregateExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("aggregate", "allFields");
  const destinationFieldName = ctx.getParam<string>("destinationFieldName", "data") ?? "data";
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const includeItemData = options.includeItemData === true;
  const mergeLists = options.mergeLists === true;
  const keepMissing = options.keepMissingAndNullValues === true;

  if (mode === "individualFields") {
    const includeContainer = ctx.getParam<{ fields?: FieldEntry[] }>("includeFields", {});
    const fields = includeContainer?.fields ?? [];
    const fieldSpecs = fields.filter(
      (f) => typeof f.fieldToAggregate === "string" && f.fieldToAggregate.length > 0,
    );

    const aggregated: Record<string, unknown[]> = {};
    for (const spec of fieldSpecs) {
      const name = spec.fieldToAggregate!;
      const outName =
        spec.renameField && spec.outputFieldName ? spec.outputFieldName : name;
      let values = inputItems.map((item) => item.json[name]);
      if (!keepMissing) {
        values = values.filter((v) => v !== null && v !== undefined);
      }
      if (mergeLists) {
        const flat: unknown[] = [];
        for (const v of values) {
          if (Array.isArray(v)) flat.push(...v);
          else flat.push(v);
        }
        aggregated[outName] = flat;
      } else {
        aggregated[outName] = values;
      }
    }

    if (includeItemData) {
      aggregated[destinationFieldName] = inputItems.map((item) => item.json) as unknown[];
    }

    return [[{ json: aggregated }]];
  }

  // allFields / allItemData
  const includeMode = ctx.getParam<string>("include", "all");
  const fieldsToInclude = (ctx.getParam<string>("fieldsToInclude", "") ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const fieldsToExclude = (ctx.getParam<string>("fieldsToExclude", "") ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const data = inputItems.map((item) => {
    const json = item.json;
    if (includeMode === "specified" || includeMode === "specifiedFields") {
      const next: Record<string, unknown> = {};
      for (const f of fieldsToInclude) {
        if (f in json) next[f] = json[f];
      }
      return next;
    }
    if (includeMode === "except" || includeMode === "allFieldsExcept") {
      const next = { ...json };
      for (const f of fieldsToExclude) delete next[f];
      return next;
    }
    return { ...json };
  });

  return [[{ json: { [destinationFieldName]: data } }]];
};

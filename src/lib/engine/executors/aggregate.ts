import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";

interface FieldEntry {
  fieldToAggregate?: string;
  renameField?: boolean;
  outputFieldName?: string;
}

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

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function binarySignature(b: unknown): string {
  if (typeof b !== "object" || b === null) return JSON.stringify(b);
  const bin = b as Record<string, unknown>;
  const mime = bin.fileMimeType ?? "";
  const type = bin.fileType ?? "";
  const size = typeof bin.size === "number" ? String(bin.size) : "";
  const name = bin.fileName ?? "";
  return `${mime}|${type}|${size}|${name}`;
}

type Ctx = Parameters<NodeExecutor>[0];

function collectFieldEntries(ctx: Ctx): FieldEntry[] {
  const canonical = ctx.getParam<{ fieldToAggregate?: FieldEntry[] } | undefined>(
    "fieldsToAggregate",
  );
  if (canonical) {
    return (canonical.fieldToAggregate ?? []).filter(
      (f) => typeof f.fieldToAggregate === "string" && f.fieldToAggregate.length > 0,
    );
  }
  const shorthand = ctx.getParam<{ fields?: FieldEntry[] } | undefined>("includeFields");
  return (shorthand?.fields ?? []).filter(
    (f) => typeof f.fieldToAggregate === "string" && f.fieldToAggregate.length > 0,
  );
}

function aggregateIndividualFields(
  ctx: Ctx,
  inputItems: INodeExecutionData[],
  disableDotNotation: boolean,
  mergeLists: boolean,
  keepMissing: boolean,
): Record<string, unknown> {
  const fieldSpecs = collectFieldEntries(ctx);
  const useDot = !disableDotNotation;
  const aggregated: Record<string, unknown> = {};

  for (const spec of fieldSpecs) {
    const name = spec.fieldToAggregate!;
    const outName =
      spec.renameField && spec.outputFieldName
        ? spec.outputFieldName
        : useDot
          ? leafName(name)
          : name;

    const collected: unknown[] = [];
    for (const item of inputItems) {
      const value = getField(item.json as Record<string, unknown>, name, useDot);
      if (value === null || value === undefined) {
        if (keepMissing) collected.push(null);
        continue;
      }
      if (mergeLists && Array.isArray(value)) {
        for (const v of value) collected.push(v);
      } else {
        collected.push(value);
      }
    }
    aggregated[outName] = collected;
  }

  return aggregated;
}

function aggregateAllItemData(
  ctx: Ctx,
  inputItems: INodeExecutionData[],
): Record<string, unknown> {
  const destinationFieldName = ctx.getParam<string>("destinationFieldName", "data") ?? "data";
  const include = ctx.getParam<string>("include", "allFields") ?? "allFields";
  const fieldsToInclude = parseList(ctx.getParam<string>("fieldsToInclude", ""));
  const fieldsToExclude = parseList(ctx.getParam<string>("fieldsToExclude", ""));

  const data = inputItems.map((item) => {
    const json = item.json as Record<string, unknown>;
    if (include === "specifiedFields") {
      const next: Record<string, unknown> = {};
      for (const f of fieldsToInclude) {
        if (f in json) next[f] = json[f];
      }
      return next;
    }
    if (include === "allFieldsExcept") {
      const next: Record<string, unknown> = { ...json };
      for (const f of fieldsToExclude) delete next[f];
      return next;
    }
    return { ...json };
  });

  return { [destinationFieldName]: data };
}

function collectBinaries(
  inputItems: INodeExecutionData[],
  keepOnlyUnique: boolean,
): Record<string, IBinaryData> {
  const out: Record<string, IBinaryData> = {};
  const seen = new Set<string>();
  let i = 0;
  for (const item of inputItems) {
    if (!item.binary) continue;
    for (const [key, value] of Object.entries(item.binary)) {
      if (keepOnlyUnique) {
        const sig = binarySignature(value);
        if (seen.has(sig)) continue;
        seen.add(sig);
      }
      out[`${key}_${i}`] = value;
      i++;
    }
  }
  return out;
}

export const aggregateExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("aggregate", "aggregateIndividualFields") ?? "aggregateIndividualFields";

  const isIndividual =
    mode === "aggregateIndividualFields" || mode === "individualFields";

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const disableDotNotation = options.disableDotNotation === true;
  const mergeLists = options.mergeLists === true;
  const includeBinaries = options.includeBinaries === true;
  const keepOnlyUnique = includeBinaries && options.keepOnlyUnique === true;
  const keepMissing =
    options.keepMissing === true || options.keepMissingAndNullValues === true;

  let outJson: Record<string, unknown>;
  if (isIndividual) {
    outJson = aggregateIndividualFields(
      ctx,
      inputItems,
      disableDotNotation,
      mergeLists,
      keepMissing,
    );
  } else {
    outJson = aggregateAllItemData(ctx, inputItems);
  }

  const outItem: INodeExecutionData = { json: outJson };

  if (includeBinaries) {
    const outBinary = collectBinaries(inputItems, keepOnlyUnique);
    if (Object.keys(outBinary).length > 0) outItem.binary = outBinary;
  }

  return [[outItem]];
};
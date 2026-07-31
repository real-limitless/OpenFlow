import type { NodeExecutor, INodeExecutionData } from "@/sdk";

function getField(obj: Record<string, unknown>, path: string, useDot: boolean): unknown {
  if (!useDot) return obj[path];
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function leafName(path: string): string {
  return path.split(".").pop() ?? path;
}

function firstSegment(path: string): string {
  return path.split(".")[0] ?? path;
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function normalize(value: unknown, caseInsensitive: boolean, trim: boolean): string {
  let v = value;
  if (typeof v === "string") {
    if (trim) v = v.trim();
    if (caseInsensitive) v = (v as string).toLowerCase();
  }
  return JSON.stringify(v);
}

/**
 * concatenateItems (formerly aggregate/aggregateItems)
 */
function handleConcatenate(ctx: Parameters<NodeExecutor>[0], inputItems: INodeExecutionData[]): INodeExecutionData[][] {
  const mode = ctx.getParam<string>("aggregate", "aggregateIndividualFields");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const disableDotNotation = options.disableDotNotation === true;
  const mergeLists = options.mergeLists === true;
  const keepMissing = options.keepMissing === true;
  const useDot = !disableDotNotation;

  const fieldSpecs: Array<{ fieldToAggregate?: string; renameField?: boolean; outputFieldName?: string }> = [];
  const raw = ctx.getParam<{ fieldToAggregate?: unknown[] } | undefined>("fieldsToAggregate");
  if (raw?.fieldToAggregate) {
    for (const f of raw.fieldToAggregate as Record<string, unknown>[]) {
      if (typeof f.fieldToAggregate === "string" && f.fieldToAggregate.length > 0) {
        fieldSpecs.push(f as { fieldToAggregate: string; renameField?: boolean; outputFieldName?: string });
      }
    }
  }

  if (mode === "aggregateIndividualFields" && fieldSpecs.length > 0) {
    const aggregated: Record<string, unknown> = {};
    for (const spec of fieldSpecs) {
      const name = spec.fieldToAggregate!;
      const outName = spec.renameField && spec.outputFieldName ? spec.outputFieldName : useDot ? leafName(name) : name;
      const collected: unknown[] = [];
      for (const item of inputItems) {
        const value = getField(item.json as Record<string, unknown>, name, useDot);
        if (value === null || value === undefined) {
          if (keepMissing) collected.push(null);
          continue;
        }
        if (mergeLists && Array.isArray(value)) {
          collected.push(...value);
        } else {
          collected.push(value);
        }
      }
      aggregated[outName] = collected;
    }
    return [[{ json: aggregated }]];
  }

  const destinationFieldName = ctx.getParam<string>("fieldName", "") || ctx.getParam<string>("destinationFieldName", "data") || "data";
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

  return [[{ json: { [destinationFieldName]: data } }]];
}

/**
 * limit
 */
function handleLimit(ctx: Parameters<NodeExecutor>[0], inputItems: INodeExecutionData[]): INodeExecutionData[][] {
  const rawMax = ctx.getParam<number>("maxItems", 0);
  const maxItems = Number.isFinite(rawMax) ? Math.max(0, Math.floor(rawMax)) : 0;
  const keep = ctx.getParam<string>("keep", "firstItems");

  if (inputItems.length <= maxItems) return [inputItems];
  if (keep === "lastItems" || keep === "last") return [inputItems.slice(inputItems.length - maxItems)];
  return [inputItems.slice(0, maxItems)];
}

/**
 * removeDuplicates
 */
function handleRemoveDuplicates(ctx: Parameters<NodeExecutor>[0], inputItems: INodeExecutionData[]): INodeExecutionData[][] {
  const compare = ctx.getParam<string>("compare", "allFields");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const caseInsensitive = options.caseInsensitive === true;
  const trimValues = options.trimValues === true;
  const removeOtherFields = options.removeOtherFields === true;

  const fieldsToCompare = parseList(ctx.getParam<string>("fieldsToCompare", ""));
  const fieldsToExclude = parseList(ctx.getParam<string>("fieldsToExclude", ""));

  const selectedFields = fieldsToCompare.length > 0 ? fieldsToCompare : fieldsToExclude;

  const keyOf = (json: Record<string, unknown>): string => {
    if (compare === "selectedFields") {
      return selectedFields.map((f) => normalize(json[f], caseInsensitive, trimValues)).join("\u0000");
    }
    if (compare === "allFieldsExcept") {
      const exclude = new Set(selectedFields);
      const keys = Object.keys(json).filter((k) => !exclude.has(k)).sort();
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
}

/**
 * sort
 */
function handleSort(ctx: Parameters<NodeExecutor>[0], inputItems: INodeExecutionData[]): INodeExecutionData[][] {
  const items = [...inputItems];
  const type = ctx.getParam<string>("type", "simple");

  if (type === "random") {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return [items];
  }

  if (type === "code") {
    const code = ctx.getParam<string>("code", "");
    const comparator = new Function("a", "b", code) as (a: INodeExecutionData, b: INodeExecutionData) => number;
    return [items.sort(comparator)];
  }

  const disableDot = ctx.getParam<boolean>("disableDotNotation", false) === true;
  const sortFieldsRaw = ctx.getParam<unknown>("sortFieldsUi", {});
  let sortFields: Array<{ fieldName?: string; order?: string }> = [];
  if (Array.isArray(sortFieldsRaw)) {
    sortFields = sortFieldsRaw as Array<{ fieldName?: string; order?: string }>;
  } else if (sortFieldsRaw && typeof sortFieldsRaw === "object") {
    for (const v of Object.values(sortFieldsRaw as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        sortFields = v as Array<{ fieldName?: string; order?: string }>;
        break;
      }
    }
  }

  if (sortFields.length === 0) return [items];

  items.sort((a, b) => {
    const aj = a.json;
    const bj = b.json;
    for (const f of sortFields) {
      const name = f.fieldName ?? "";
      if (!name) continue;
      const av = getField(aj, name, !disableDot);
      const bv = getField(bj, name, !disableDot);
      const aStr = av == null ? "" : String(av);
      const bStr = bv == null ? "" : String(bv);
      const cmp = aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
      if (cmp !== 0) {
        const desc = f.order === "descending" || f.order === "desc";
        return desc ? -cmp : cmp;
      }
    }
    return 0;
  });

  return [items];
}

/**
 * splitOutItems
 */
function handleSplitOutItems(ctx: Parameters<NodeExecutor>[0], inputItems: INodeExecutionData[]): INodeExecutionData[][] {
  const fieldToSplitOut = ctx.getParam<string>("fieldToSplitOut", "") || ctx.getParam<string>("arrayFieldName", "") || "";
  const include = ctx.getParam<string>("include", "noOtherFields");
  const fieldsToIncludeRaw = ctx.getParam<string>("fieldsToInclude", "") ?? "";
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const disableDotNotation = options.disableDotNotation === true;
  const destinationFieldName = (options.destinationFieldName as string | undefined) ?? "";
  const includeBinary = options.includeBinary === true;

  const fields = parseList(fieldToSplitOut);
  const fieldsToInclude = parseList(fieldsToIncludeRaw);
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
        const outItem: INodeExecutionData = { json: {}, pairedItem: item.pairedItem };
        if (element && typeof element === "object" && !Array.isArray(element)) {
          const elementObj = element as Record<string, unknown>;
          outItem.json = destinationFieldName ? { ...base, [destinationFieldName]: elementObj } : { ...base, ...elementObj };
        } else {
          const key = destinationFieldName || leafName(field);
          outItem.json = { ...base, [key]: element };
        }
        if (includeBinary && item.binary) outItem.binary = item.binary;
        output.push(outItem);
      }
    }
  }
  return [output];
}

/**
 * summarize
 */
function handleSummarize(ctx: Parameters<NodeExecutor>[0], inputItems: INodeExecutionData[]): INodeExecutionData[][] {
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const disableDotNotation = options.disableDotNotation === true;
  const outputFormat = (options.outputFormat as string) ?? "separateItems";
  const skipEmptySplitFields = options.skipEmptySplitFields === true;
  const useDot = !disableDotNotation;

  const splitFields = parseList(ctx.getParam<string>("fieldsToSplitBy", ""));
  const rawFields = ctx.getParam<{ values?: unknown[] } | undefined>("fieldsToSummarize");
  const fieldSpecs: Array<{ field: string; aggregation: string; includeEmpty?: boolean; separateBy?: string; customSeparator?: string }> = [];
  if (rawFields?.values) {
    for (const v of rawFields.values as Record<string, unknown>[]) {
      fieldSpecs.push(v as { field: string; aggregation: string; includeEmpty?: boolean; separateBy?: string; customSeparator?: string });
    }
  }

  const groupMap = new Map<string, { keys: unknown[]; items: INodeExecutionData[] }>();
  for (const item of inputItems) {
    const json = item.json as Record<string, unknown>;
    const keys = splitFields.map((f) => getField(json, f, useDot));
    if (skipEmptySplitFields && keys.some(isEmpty)) continue;
    const groupKey = JSON.stringify(keys);
    let group = groupMap.get(groupKey);
    if (!group) {
      group = { keys, items: [] };
      groupMap.set(groupKey, group);
    }
    group.items.push(item);
  }
  if (groupMap.size === 0 && splitFields.length === 0) {
    groupMap.set("[]", { keys: [], items: [] });
  }

  const groups = [...groupMap.values()];
  const splitFieldNames = splitFields.map((f) => (useDot ? leafName(f) : f));

  function resolveSeparator(separateBy: string | undefined, customSeparator: string | undefined): string {
    switch (separateBy) {
      case ",": return ",";
      case ", ": return ", ";
      case "\n": return "\n";
      case "": return "";
      case " ": return " ";
      case "other": return customSeparator ?? "";
      default: return separateBy ?? ",";
    }
  }

  function computeAggregation(spec: typeof fieldSpecs[0], items: INodeExecutionData[]): unknown {
    const { aggregation, field, includeEmpty = false, separateBy, customSeparator } = spec;
    const hasField = field && field.length > 0;
    const values: unknown[] = [];
    for (const item of items) {
      const value = hasField ? getField(item.json as Record<string, unknown>, field, useDot) : item.json;
      if (isEmpty(value)) { if (includeEmpty) values.push(value); continue; }
      values.push(value);
    }
    switch (aggregation) {
      case "append": return values;
      case "concatenate": return values.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(resolveSeparator(separateBy, customSeparator));
      case "count": return values.length;
      case "countUnique": return new Set(values.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))).size;
      case "sum": { let s = 0; for (const v of values) { const n = toNumber(v); if (n !== null) s += n; } return s; }
      case "average": { let s = 0; let c = 0; for (const v of values) { const n = toNumber(v); if (n !== null) { s += n; c++; } } return c > 0 ? s / c : null; }
      case "max": { let m: number | null = null; for (const v of values) { const n = toNumber(v); if (n !== null && (m === null || n > m)) m = n; } return m; }
      case "min": { let m: number | null = null; for (const v of values) { const n = toNumber(v); if (n !== null && (m === null || n < m)) m = n; } return m; }
      default: return null;
    }
  }

  function outputFieldName(aggregation: string, field: string): string {
    if (aggregation === "count" || aggregation === "countUnique") return aggregation;
    return field;
  }

  const groupResults = groups.map((group) => {
    const result: Record<string, unknown> = {};
    for (let i = 0; i < splitFieldNames.length; i++) result[splitFieldNames[i]] = group.keys[i];
    for (const spec of fieldSpecs) result[outputFieldName(spec.aggregation, spec.field)] = computeAggregation(spec, group.items);
    return result;
  });

  if (outputFormat === "singleItem") {
    const single: Record<string, unknown> = {};
    for (const name of splitFieldNames) single[name] = groupResults.map((r) => r[name]);
    for (const spec of fieldSpecs) {
      const outName = outputFieldName(spec.aggregation, spec.field);
      single[outName] = groupResults.map((r) => r[outName]);
    }
    return [[{ json: single }]];
  }

  return [groupResults.map((json) => ({ json }))];
}

export const itemListsExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const operation = ctx.getParam<string>("operation", "");
  const mode = ctx.getParam<string>("mode", "");

  // Backward compat: map old mode-based API to new operation-based API
  const realOp = operation || (mode === "aggregateItems" || mode === "aggregate" ? "concatenateItems"
    : mode === "splitOutItems" || mode === "splitOut" ? "splitOutItems"
    : "splitOutItems");

  switch (realOp) {
    case "concatenateItems":
      return handleConcatenate(ctx, inputItems);
    case "limit":
      return handleLimit(ctx, inputItems);
    case "removeDuplicates":
      return handleRemoveDuplicates(ctx, inputItems);
    case "sort":
      return handleSort(ctx, inputItems);
    case "splitOutItems":
      return handleSplitOutItems(ctx, inputItems);
    case "summarize":
      return handleSummarize(ctx, inputItems);
    default:
      return [inputItems];
  }
};
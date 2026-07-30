import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface SummarizeField {
  aggregation: string;
  field: string;
  includeEmpty?: boolean;
  separateBy?: string;
  customSeparator?: string;
}

type Ctx = Parameters<NodeExecutor>[0];

function getField(obj: Record<string, unknown>, path: string, useDot: boolean): unknown {
  if (!path) return obj;
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

function resolveSeparator(
  separateBy: string | undefined,
  customSeparator: string | undefined,
): string {
  switch (separateBy) {
    case ",":
      return ",";
    case ", ":
      return ", ";
    case "\n":
      return "\n";
    case "":
      return "";
    case " ":
      return " ";
    case "other":
      return customSeparator ?? "";
    default:
      return separateBy ?? ",";
  }
}

function outputFieldName(aggregation: string, field: string): string {
  if (aggregation === "count" || aggregation === "countUnique") {
    return aggregation;
  }
  return field;
}

function parseSplitFields(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectFields(ctx: Ctx): SummarizeField[] {
  const raw = ctx.getParam<{ values?: SummarizeField[] } | undefined>("fieldsToSummarize");
  return raw?.values ?? [];
}

function computeAggregation(
  spec: SummarizeField,
  items: INodeExecutionData[],
  useDot: boolean,
): unknown {
  const { aggregation, field, includeEmpty = false, separateBy, customSeparator } = spec;
  const hasField = field && field.length > 0;

  const values: unknown[] = [];
  for (const item of items) {
    const value = hasField
      ? getField(item.json as Record<string, unknown>, field, useDot)
      : item.json;
    if (isEmpty(value)) {
      if (includeEmpty) values.push(value);
      continue;
    }
    values.push(value);
  }

  switch (aggregation) {
    case "append":
      return values;
    case "concatenate":
      return values
        .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
        .join(resolveSeparator(separateBy, customSeparator));
    case "count":
      return values.length;
    case "countUnique":
      return new Set(values.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))))
        .size;
    case "sum": {
      let sum = 0;
      for (const v of values) {
        const n = toNumber(v);
        if (n !== null) sum += n;
      }
      return sum;
    }
    case "average": {
      let sum = 0;
      let count = 0;
      for (const v of values) {
        const n = toNumber(v);
        if (n !== null) {
          sum += n;
          count++;
        }
      }
      return count > 0 ? sum / count : null;
    }
    case "max": {
      let max: number | null = null;
      for (const v of values) {
        const n = toNumber(v);
        if (n !== null && (max === null || n > max)) max = n;
      }
      return max;
    }
    case "min": {
      let min: number | null = null;
      for (const v of values) {
        const n = toNumber(v);
        if (n !== null && (min === null || n < min)) min = n;
      }
      return min;
    }
    default:
      return null;
  }
}

export const summarizeExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const fields = collectFields(ctx);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const disableDotNotation = options.disableDotNotation === true;
  const outputFormat = (options.outputFormat as string) ?? "separateItems";
  const skipEmptySplitFields = options.skipEmptySplitFields === true;
  const useDot = !disableDotNotation;

  const splitFields = parseSplitFields(ctx.getParam<string>("fieldsToSplitBy", ""));

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

  const groupResults = groups.map((group) => {
    const result: Record<string, unknown> = {};

    for (let i = 0; i < splitFieldNames.length; i++) {
      result[splitFieldNames[i]] = group.keys[i];
    }

    for (const spec of fields) {
      const outName = outputFieldName(spec.aggregation, spec.field);
      result[outName] = computeAggregation(spec, group.items, useDot);
    }

    return result;
  });

  if (outputFormat === "singleItem") {
    const single: Record<string, unknown> = {};

    for (const name of splitFieldNames) {
      single[name] = groupResults.map((r) => r[name]);
    }

    for (const spec of fields) {
      const outName = outputFieldName(spec.aggregation, spec.field);
      single[outName] = groupResults.map((r) => r[outName]);
    }

    return [[{ json: single }]];
  }

  return [groupResults.map((json) => ({ json }))];
};

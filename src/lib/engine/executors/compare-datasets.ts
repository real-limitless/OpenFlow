import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface MatchRow {
  field1?: string;
  field2?: string;
}

function resolveField(
  json: Record<string, unknown>,
  field: string,
  disableDotNotation: boolean,
): unknown {
  if (!field) return undefined;
  if (disableDotNotation || !field.includes(".")) {
    return json[field];
  }
  let cur: unknown = json;
  for (const part of field.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function valuesEqual(a: unknown, b: unknown, fuzzy: boolean): boolean {
  if (a === b) return true;
  if (fuzzy) {
    if (a == b) return true;
  }
  if (a && typeof a === "object" && b && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function keyValue(
  json: Record<string, unknown>,
  fields: string[],
  disableDotNotation: boolean,
  fuzzy: boolean,
): string {
  return fields
    .map((f) => {
      const v = resolveField(json, f, disableDotNotation);
      return fuzzy ? String(v) : JSON.stringify(v);
    })
    .join("\u0000");
}

function parseList(value: unknown): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const compareDatasetsExecutor: NodeExecutor = async (ctx) => {
  const inputA = ctx.getInputItems(0);
  const inputB = ctx.getInputItems(1);

  const mergeByFields = ctx.getParam<{ values?: MatchRow[] }>("mergeByFields", {
    values: [],
  });
  const rows = mergeByFields?.values ?? [];
  const aMatchFields = rows.map((r) => r.field1 ?? "").filter(Boolean);
  const bMatchFields = rows.map((r) => r.field2 ?? "").filter(Boolean);

  const resolve = ctx.getParam<string>("resolve", "preferInput2");
  const topFuzzy = ctx.getParam<boolean>("fuzzyCompare", false);
  const preferWhenMix = ctx.getParam<string>("preferWhenMix", "input1");
  const exceptWhenMix = parseList(ctx.getParam<string>("exceptWhenMix", ""));

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const optionsFuzzy = options.fuzzyCompare === true;
  const fuzzy = topFuzzy || optionsFuzzy;
  const disableDotNotation = options.disableDotNotation === true;
  const skipFields = new Set(parseList(options.skipFields));
  const multipleMatches = (options.multipleMatches as string) ?? "first";

  const inAOnly: INodeExecutionData[] = [];
  const same: INodeExecutionData[] = [];
  const different: INodeExecutionData[] = [];
  const inBOnly: INodeExecutionData[] = [];

  if (aMatchFields.length === 0 || bMatchFields.length === 0) {
    return [inputA, [], [], inputB];
  }

  const bIndex = new Map<string, number[]>();
  inputB.forEach((item, idx) => {
    const k = keyValue(item.json, bMatchFields, disableDotNotation, fuzzy);
    if (!bIndex.has(k)) bIndex.set(k, []);
    bIndex.get(k)!.push(idx);
  });

  const consumedB = new Set<number>();
  const matchedB = new Set<number>();

  const compareAllFields = (
    aJson: Record<string, unknown>,
    bJson: Record<string, unknown>,
  ): boolean => {
    const keys = new Set<string>([...Object.keys(aJson), ...Object.keys(bJson)]);
    for (const key of keys) {
      if (skipFields.has(key)) continue;
      const av = resolveField(aJson, key, disableDotNotation);
      const bv = resolveField(bJson, key, disableDotNotation);
      if (!valuesEqual(av, bv, fuzzy)) return false;
    }
    return true;
  };

  const resolveDifferent = (
    aItem: INodeExecutionData,
    bItem: INodeExecutionData,
  ): INodeExecutionData => {
    const aJson = aItem.json;
    const bJson = bItem.json;
    if (resolve === "preferInput1") {
      return { json: { ...aJson }, pairedItem: aItem.pairedItem };
    }
    if (resolve === "preferInput2") {
      return { json: { ...bJson }, pairedItem: bItem.pairedItem };
    }
    if (resolve === "mix") {
      const base = preferWhenMix === "input2" ? bJson : aJson;
      const other = preferWhenMix === "input2" ? aJson : bJson;
      const merged: Record<string, unknown> = { ...base };
      for (const f of exceptWhenMix) {
        if (f in other) merged[f] = other[f];
      }
      const baseItem = preferWhenMix === "input2" ? bItem : aItem;
      return { json: merged, pairedItem: baseItem.pairedItem };
    }
    return {
      json: { input1: aJson, input2: bJson },
      pairedItem: aItem.pairedItem,
    };
  };

  for (const aItem of inputA) {
    const k = keyValue(aItem.json, aMatchFields, disableDotNotation, fuzzy);
    const candidates = bIndex.get(k) ?? [];

    let pairs: INodeExecutionData[] = [];
    if (multipleMatches === "all") {
      pairs = candidates.map((idx) => inputB[idx]);
      for (const idx of candidates) matchedB.add(idx);
    } else {
      const firstIdx = candidates.find((idx) => !consumedB.has(idx));
      if (firstIdx !== undefined) {
        consumedB.add(firstIdx);
        matchedB.add(firstIdx);
        pairs = [inputB[firstIdx]];
      }
    }

    if (pairs.length === 0) {
      inAOnly.push(aItem);
      continue;
    }

    for (const bItem of pairs) {
      if (compareAllFields(aItem.json, bItem.json)) {
        same.push({ json: { ...aItem.json }, pairedItem: aItem.pairedItem });
      } else {
        different.push(resolveDifferent(aItem, bItem));
      }
    }
  }

  if (multipleMatches === "first") {
    inputB.forEach((item, idx) => {
      if (!matchedB.has(idx)) inBOnly.push(item);
    });
  } else {
    inputB.forEach((item, idx) => {
      if (!matchedB.has(idx)) inBOnly.push(item);
    });
  }

  return [inAOnly, same, different, inBOnly];
};

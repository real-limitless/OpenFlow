import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface SortField {
  fieldName?: string;
  order?: string;
}

function getField(obj: Record<string, unknown>, path: string, useDot: boolean): unknown {
  if (!useDot) return obj[path];
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function parseSortFields(raw: unknown): SortField[] {
  if (Array.isArray(raw)) return raw as SortField[];
  if (raw && typeof raw === "object") {
    for (const value of Object.values(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) return value as SortField[];
    }
  }
  return [];
}

export const sortExecutor: NodeExecutor = async (ctx) => {
  const inputItems = [...ctx.getInputItems(0)];
  const type = ctx.getParam<string>("type", "simple");

  if (type === "random") {
    for (let i = inputItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [inputItems[i], inputItems[j]] = [inputItems[j], inputItems[i]];
    }
    return [inputItems as INodeExecutionData[]];
  }

  if (type === "code") {
    const code = ctx.getParam<string>("code", "");
    // TODO(spec): sandbox — code type uses new Function (partial per spec gap).
    const comparator = new Function("a", "b", code) as (
      a: INodeExecutionData,
      b: INodeExecutionData,
    ) => number;
    const sorted = [...inputItems].sort(comparator);
    return [sorted as INodeExecutionData[]];
  }

  // simple (default)
  const disableDot =
    ctx.getParam<boolean>("disableDotNotation", false) === true ||
    ctx.getParam<Record<string, unknown>>("options", {})?.disableDotNotation === true;

  let fields = parseSortFields(ctx.getParam("fieldToSortBy"));

  // Legacy fallbacks for backward compatibility
  if (fields.length === 0) {
    const legacy = ctx.getParam<{ sortFieldsUi?: SortField[] } | SortField[]>("sortFieldsUi", {});
    if (Array.isArray(legacy)) {
      fields = legacy;
    } else if (legacy && Array.isArray(legacy.sortFieldsUi)) {
      fields = legacy.sortFieldsUi;
    }
  }
  if (fields.length === 0) {
    const singleField = ctx.getParam<string>("fieldName", "");
    if (singleField) {
      fields = [{ fieldName: singleField, order: ctx.getParam<string>("order", "ascending") }];
    }
  }

  if (fields.length === 0) {
    return [inputItems as INodeExecutionData[]];
  }

  const sorted = [...inputItems].sort((a, b) => {
    const aj = (a as INodeExecutionData).json;
    const bj = (b as INodeExecutionData).json;
    for (const f of fields) {
      const name = f.fieldName ?? "";
      if (!name) continue;
      const av = getField(aj, name, !disableDot);
      const bv = getField(bj, name, !disableDot);
      // JS Array.sort string-conversion semantics (documented): convert to
      // string and compare lexicographically. [2, 10, 1] asc -> [1, 10, 2].
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

  return [sorted as INodeExecutionData[]];
};

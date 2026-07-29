import type { NodeExecutor, INodeExecutionData } from "@/sdk";

function getField(obj: Record<string, unknown>, path: string, useDot: boolean): unknown {
  if (!useDot) return obj[path];
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

interface SortField {
  fieldName?: string;
  order?: string;
}

export const sortExecutor: NodeExecutor = async (ctx) => {
  const inputItems = [...ctx.getInputItems(0)];
  const type = ctx.getParam<string>("type", "simple");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const disableDot = options.disableDotNotation === true;

  if (type === "random") {
    for (let i = inputItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [inputItems[i], inputItems[j]] = [inputItems[j], inputItems[i]];
    }
    return [inputItems];
  }

  // simple (default)
  const sortFieldsContainer = ctx.getParam<{ sortFieldsUi?: SortField[] } | SortField[]>(
    "sortFieldsUi",
    {},
  );
  let fields: SortField[] = [];
  if (Array.isArray(sortFieldsContainer)) {
    fields = sortFieldsContainer;
  } else if (sortFieldsContainer && Array.isArray(sortFieldsContainer.sortFieldsUi)) {
    fields = sortFieldsContainer.sortFieldsUi;
  }

  // Also accept simple fieldName + order
  const singleField = ctx.getParam<string>("fieldName", "");
  if (fields.length === 0 && singleField) {
    fields = [{ fieldName: singleField, order: ctx.getParam<string>("order", "ascending") }];
  }

  if (fields.length === 0) {
    return [inputItems];
  }

  const sorted = [...inputItems].sort((a, b) => {
    for (const f of fields) {
      const name = f.fieldName ?? "";
      if (!name) continue;
      const av = getField(a.json, name, !disableDot);
      const bv = getField(b.json, name, !disableDot);
      const aStr = av == null ? "" : String(av);
      const bStr = bv == null ? "" : String(bv);
      let cmp = 0;
      const aNum = Number(av);
      const bNum = Number(bv);
      if (
        typeof av === "number" ||
        typeof bv === "number" ||
        (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aStr !== "" && bStr !== "")
      ) {
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
          cmp = aNum - bNum;
        } else {
          cmp = aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
        }
      } else {
        cmp = aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
      }
      if (cmp !== 0) {
        const desc = f.order === "descending" || f.order === "desc";
        return desc ? -cmp : cmp;
      }
    }
    return 0;
  });

  return [sorted as INodeExecutionData[]];
};

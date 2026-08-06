import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";
import { parseFormElements } from "@/lib/forms/path";

export const formExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const operation = ctx.getParam<string>("operation", "form");

  if (operation === "completion") {
    if (items.length === 0) return [[{ json: {} }]];
    return [items.map((item, idx) => withPairedItem(item, idx))];
  }

  const formFieldsRaw = ctx.getParam<unknown>("formFields", []);
  const fields = parseFormElements(formFieldsRaw);

  if (items.length === 0) return [[{ json: {} }]];

  return [
    items.map((item, idx) => {
      const json = { ...item.json };
      for (const f of fields) {
        const name = f.fieldName;
        if (!name) continue;
        if (name in json) continue;
        if (f.elementType === "hidden" && f.fieldValue !== undefined) {
          json[name] = f.fieldValue;
        } else if (f.defaultValue !== undefined) {
          json[name] = f.defaultValue;
        }
      }
      return { ...item, json, pairedItem: item.pairedItem ?? { item: idx, input: 0 } };
    }),
  ];
};

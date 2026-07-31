import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";

interface FormField {
  fieldLabel?: string;
  fieldName?: string;
  fieldType?: string;
  defaultValue?: unknown;
  fieldValue?: unknown;
  requiredField?: boolean;
  placeholder?: string;
  [key: string]: unknown;
}

export const formExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const operation = ctx.getParam<string>("operation", "form");

  if (operation === "completion") {
    if (items.length === 0) return [[{ json: {} }]];
    return [items.map((item, idx) => withPairedItem(item, idx))];
  }

  const formFieldsRaw = ctx.getParam<FormField[] | { values?: FormField[] }>("formFields", []);
  const fields = extractFormFields(formFieldsRaw);

  if (items.length === 0) return [[{ json: {} }]];

  return [
    items.map((item, idx) => {
      const json = { ...item.json };
      for (const f of fields) {
        const name = f.fieldName;
        if (!name) continue;
        if (name in json) continue;
        if (f.fieldType === "hiddenField" && f.fieldValue !== undefined) {
          json[name] = f.fieldValue;
        } else if (f.defaultValue !== undefined) {
          json[name] = f.defaultValue;
        }
      }
      return { ...item, json, pairedItem: item.pairedItem ?? { item: idx, input: 0 } };
    }),
  ];
};

function extractFormFields(raw: unknown): FormField[] {
  if (Array.isArray(raw)) return raw as FormField[];
  if (raw && typeof raw === "object") {
    const r = raw as { values?: FormField[] };
    if (r.values && Array.isArray(r.values)) return r.values;
  }
  return [];
}
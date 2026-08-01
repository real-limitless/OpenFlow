import type { INode } from "../workflow/types";

export const FORM_TRIGGER_TYPE = "n8n-nodes-base.formTrigger";

export function isFormTriggerNode(node: { type?: string }): boolean {
  return node.type === FORM_TRIGGER_TYPE;
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Resolve public form slug from node parameters. */
export function resolveFormPath(node: INode): string {
  const params = (node.parameters ?? {}) as Record<string, unknown>;
  const options = (params.options ?? {}) as Record<string, unknown>;
  const raw =
    (typeof params.formPath === "string" && params.formPath.trim()) ||
    (typeof options.formPath === "string" && options.formPath.trim()) ||
    "";
  if (raw) return slugify(raw);
  const base = (node.id || node.name || "form").toString();
  return slugify(base).slice(0, 48) || "form";
}

export type FormField = {
  fieldLabel: string;
  fieldName: string;
  elementType: string;
  placeholder?: string;
  defaultValue?: string;
  requiredField?: boolean;
  html?: string;
  fieldValue?: string;
  options?: string[];
  multipleChoice?: boolean;
};

export function parseFormElements(raw: unknown): FormField[] {
  if (!raw) return [];
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.values)) list = o.values;
    else if (Array.isArray(o.field)) list = o.field;
    else if (Array.isArray(o.formElements)) list = o.formElements;
  }
  const out: FormField[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const fieldName = String(f.fieldName ?? f.name ?? "").trim();
    const fieldLabel = String(f.fieldLabel ?? f.label ?? fieldName).trim();
    if (!fieldName && f.elementType !== "customHtml") continue;
    const elementType = String(f.elementType ?? f.type ?? "text").trim() || "text";
    let options: string[] | undefined;
    if (Array.isArray(f.fieldOptions)) {
      options = f.fieldOptions.map((x) => String(x));
    } else if (typeof f.fieldOptions === "string" && f.fieldOptions.trim()) {
      options = f.fieldOptions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (Array.isArray(f.options)) {
      options = f.options.map((x) =>
        typeof x === "object" && x && "value" in (x as object)
          ? String((x as { value: unknown }).value)
          : String(x),
      );
    }
    out.push({
      fieldLabel: fieldLabel || fieldName || "Field",
      fieldName: fieldName || `field_${out.length}`,
      elementType,
      placeholder: f.placeholder != null ? String(f.placeholder) : undefined,
      defaultValue: f.defaultValue != null ? String(f.defaultValue) : undefined,
      requiredField: Boolean(f.requiredField),
      html: f.html != null ? String(f.html) : undefined,
      fieldValue: f.fieldValue != null ? String(f.fieldValue) : undefined,
      options,
      multipleChoice: Boolean(f.multipleChoice),
    });
  }
  return out;
}

export function formNodeParams(node: INode): {
  formTitle: string;
  formDescription: string;
  formPath: string;
  responseMode: string;
  authentication: string;
  elements: FormField[];
  options: Record<string, unknown>;
} {
  const params = (node.parameters ?? {}) as Record<string, unknown>;
  const options = (params.options ?? {}) as Record<string, unknown>;
  return {
    formTitle: String(params.formTitle ?? node.name ?? "Form"),
    formDescription: String(params.formDescription ?? ""),
    formPath: resolveFormPath(node),
    responseMode: String(params.responseMode ?? "formSubmitted"),
    authentication: String(params.authentication ?? "none"),
    elements: parseFormElements(params.formElements),
    options,
  };
}

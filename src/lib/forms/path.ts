import type { INode } from "../workflow/types";
import { evaluateExpression } from "../expressions/evaluate";

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

const ELEMENT_TYPE_ALIASES: Record<string, string> = {
  hiddenfield: "hidden",
  hidden: "hidden",
  html: "customHtml",
  customhtml: "customHtml",
  checkbox: "checkboxes",
  checkboxes: "checkboxes",
  dropdown: "dropdown",
  radio: "radio",
  textarea: "textarea",
  email: "email",
  number: "number",
  password: "password",
  date: "date",
  file: "file",
  text: "text",
};

function normalizeElementType(raw: unknown): string {
  const s = String(raw ?? "text").trim() || "text";
  const key = s.toLowerCase().replace(/[\s_]+/g, "");
  return ELEMENT_TYPE_ALIASES[key] ?? s;
}

/** Coerce requiredField from boolean, string, or simple expression. */
export function coerceRequiredField(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw == null || raw === "") return false;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return false;
    const lower = t.toLowerCase();
    if (lower === "false" || lower === "0" || lower === "no") return false;
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (t.startsWith("=") || t.startsWith("{{")) {
      const result = evaluateExpression(t, { json: {} });
      if (result.ok) return Boolean(result.value);
      // Failed expression that literally looks like false
      if (/false/i.test(t)) return false;
      return false;
    }
    return Boolean(t);
  }
  return Boolean(raw);
}

/** Strip a single leading `=` used as n8n static-string prefix (not a live expression). */
export function stripStaticEquals(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  let s = String(raw);
  if (s.startsWith("={{") || s.startsWith("{{")) {
    const result = evaluateExpression(s, { json: {} });
    if (result.ok && result.value != null) return String(result.value);
    return s;
  }
  if (s.startsWith("=") && !s.startsWith("={{")) {
    s = s.slice(1);
  }
  return s;
}

function uniqueFieldName(base: string, used: Set<string>): string {
  let name = base || "field";
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let i = 2;
  while (used.has(`${name}_${i}`)) i += 1;
  const out = `${name}_${i}`;
  used.add(out);
  return out;
}

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
    else if (Array.isArray(o.formFields)) list = o.formFields;
  }
  const out: FormField[] = [];
  const usedNames = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const elementType = normalizeElementType(f.elementType ?? f.fieldType ?? f.type ?? "text");
    const fieldLabel = String(f.fieldLabel ?? f.label ?? "").trim();
    let fieldName = String(f.fieldName ?? f.name ?? f.elementName ?? "").trim();
    if (!fieldName) {
      if (elementType === "customHtml") {
        fieldName = uniqueFieldName(`html_${out.length}`, usedNames);
      } else {
        const fromLabel = slugify(fieldLabel).replace(/-/g, "_") || `field_${out.length}`;
        fieldName = uniqueFieldName(fromLabel, usedNames);
      }
    } else {
      fieldName = uniqueFieldName(fieldName, usedNames);
    }

    let options: string[] | undefined;
    if (Array.isArray(f.fieldOptions)) {
      options = f.fieldOptions.map((x) => String(x));
    } else if (typeof f.fieldOptions === "string" && f.fieldOptions.trim()) {
      options = f.fieldOptions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (
      f.fieldOptions &&
      typeof f.fieldOptions === "object" &&
      Array.isArray((f.fieldOptions as { values?: unknown[] }).values)
    ) {
      options = ((f.fieldOptions as { values: unknown[] }).values).map((x) =>
        typeof x === "object" && x && "option" in (x as object)
          ? String((x as { option: unknown }).option)
          : typeof x === "object" && x && "value" in (x as object)
            ? String((x as { value: unknown }).value)
            : String(x),
      );
    } else if (Array.isArray(f.options)) {
      options = f.options.map((x) =>
        typeof x === "object" && x && "value" in (x as object)
          ? String((x as { value: unknown }).value)
          : String(x),
      );
    }

    const placeholder = stripStaticEquals(f.placeholder);
    const defaultValue =
      f.defaultValue != null ? stripStaticEquals(f.defaultValue) : undefined;
    const fieldValue = f.fieldValue != null ? stripStaticEquals(f.fieldValue) : undefined;

    out.push({
      fieldLabel: fieldLabel || fieldName || "Field",
      fieldName,
      elementType,
      placeholder,
      defaultValue,
      requiredField: coerceRequiredField(f.requiredField),
      html: f.html != null ? String(f.html) : undefined,
      fieldValue,
      options,
      multipleChoice: Boolean(f.multipleChoice ?? f.multiselect),
    });
  }
  return out;
}

/** n8n responseMode aliases → OpenFlow enums. */
export function normalizeFormResponseMode(raw: unknown): string {
  const s = String(raw ?? "formSubmitted").trim();
  if (s === "lastNode" || s === "whenLastNode" || s === "onLastNode") {
    return "workflowFinishes";
  }
  if (s === "responseNode" || s === "usingResponseNodes") {
    return "workflowFinishes";
  }
  if (s === "onReceived" || s === "immediately") {
    return "formSubmitted";
  }
  return s || "formSubmitted";
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
  const fieldsRaw = params.formFields ?? params.formElements;
  const descriptionRaw = stripStaticEquals(params.formDescription) ?? "";
  return {
    formTitle: String(params.formTitle ?? node.name ?? "Form"),
    formDescription: descriptionRaw,
    formPath: resolveFormPath(node),
    responseMode: normalizeFormResponseMode(params.responseMode),
    authentication: String(params.authentication ?? "none"),
    elements: parseFormElements(fieldsRaw),
    options,
  };
}

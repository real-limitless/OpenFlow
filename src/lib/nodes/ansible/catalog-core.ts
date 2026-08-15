import type { INodeProperties, INodePropertyOption } from "@/lib/nodes/types";
import type { AnsibleGalleryEntry, AnsibleModuleSchema, AnsibleOptionSchema } from "./types";

export function searchGalleryEntries(
  items: AnsibleGalleryEntry[],
  query: string,
  limit = 80,
): AnsibleGalleryEntry[] {
  const q = query.trim().toLowerCase();
  const capped = Math.max(1, Math.min(limit, 500));
  if (!q) return items.slice(0, capped);
  const scored: Array<[number, AnsibleGalleryEntry]> = [];
  for (const item of items) {
    const hay = [item.fqcn, item.shortName, item.collection, item.description]
      .join("\n")
      .toLowerCase();
    if (!hay.includes(q)) continue;
    let score = 10;
    const fqcn = item.fqcn.toLowerCase();
    const short = item.shortName.toLowerCase();
    if (fqcn === q || short === q) score = 100;
    else if (fqcn.endsWith(`.${q}`) || short.startsWith(q)) score = 50;
    else if (fqcn.includes(q)) score = 25;
    scored.push([score, item]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].fqcn.localeCompare(b[1].fqcn));
  return scored.slice(0, capped).map(([, x]) => x);
}

export function groupGalleryByCollection(
  entries: AnsibleGalleryEntry[],
): Array<{ collection: string; items: AnsibleGalleryEntry[] }> {
  const map = new Map<string, AnsibleGalleryEntry[]>();
  for (const e of entries) {
    const c = e.collection || "other";
    const list = map.get(c) ?? [];
    list.push(e);
    map.set(c, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([collection, items]) => ({
      collection,
      items: items.sort((x, y) => x.shortName.localeCompare(y.shortName)),
    }));
}

function mapOptionType(t: string): INodeProperties["type"] {
  switch ((t || "string").toLowerCase()) {
    case "boolean":
    case "bool":
      return "boolean";
    case "number":
    case "int":
    case "float":
      return "number";
    case "list":
    case "dict":
      return "json";
    default:
      return "string";
  }
}

export function ansibleOptionToProperty(opt: AnsibleOptionSchema): INodeProperties {
  const choices = Array.isArray(opt.choices) ? opt.choices : null;
  const mapped = choices?.length ? "options" : mapOptionType(opt.type);
  const base: INodeProperties = {
    displayName: opt.displayName || opt.name,
    name: opt.name,
    type: mapped,
    default:
      opt.default ??
      (mapped === "boolean" ? false : mapped === "json" ? {} : mapped === "number" ? 0 : ""),
    description: opt.description,
    required: Boolean(opt.required),
  };
  if (choices?.length) {
    base.options = choices.map((c): INodePropertyOption => ({
      name: String(c),
      value: c as string | number | boolean,
    }));
  }
  if (opt.noLog) {
    base.typeOptions = { ...(base.typeOptions ?? {}), password: true };
  }
  if (base.type === "json") {
    base.typeOptions = { ...(base.typeOptions ?? {}), rows: 4 };
  }
  return base;
}

export function schemaToProperties(schema: AnsibleModuleSchema): INodeProperties[] {
  return (schema.options ?? []).map(ansibleOptionToProperty);
}

/** True when schema has enough options for Form UI. */
export function schemaHasFormFields(schema: AnsibleModuleSchema | null | undefined): boolean {
  return Boolean(schema?.options && schema.options.length > 0);
}

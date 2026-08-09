/**
 * Server-side Ansible catalog loader (Node fs).
 * Does NOT import thousands of JSON files into the client bundle.
 *
 * Resolution order for catalog root:
 *   1. OPENFLOW_ANSIBLE_CATALOG_DIR
 *   2. <cwd>/data/ansible-catalog
 *   3. <cwd>/src/lib/nodes/ansible/fallback  (small fixture set)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AnsibleGalleryEntry, AnsibleModuleSchema } from "./types";
import { searchGalleryEntries } from "./catalog-core";

export type AnsibleCollectionSummary = {
  name: string;
  moduleCount: number;
};

let cachedRoot: string | null = null;
let cachedGallery: AnsibleGalleryEntry[] | null = null;
let cachedGalleryMtime = 0;
let cachedCollections: AnsibleCollectionSummary[] | null = null;
let cachedByCollection: Map<string, AnsibleGalleryEntry[]> | null = null;
const schemaCache = new Map<string, AnsibleModuleSchema | null>();
const schemaFileExistsCache = new Map<string, boolean>();

export function resolveAnsibleCatalogRoot(cwd = process.cwd()): string {
  const env = process.env.OPENFLOW_ANSIBLE_CATALOG_DIR?.trim();
  if (env) {
    const p = resolve(env);
    if (existsSync(p)) return p;
  }
  const data = resolve(cwd, "data/ansible-catalog");
  if (existsSync(join(data, "gallery.json"))) return data;
  const fallback = resolve(cwd, "src/lib/nodes/ansible/fallback");
  if (existsSync(join(fallback, "gallery.json"))) return fallback;
  // last resort: legacy path next to this package
  const legacy = resolve(cwd, "src/lib/nodes/ansible");
  if (existsSync(join(legacy, "gallery.json"))) return legacy;
  return data;
}

export function getAnsibleCatalogRoot(): string {
  if (!cachedRoot) cachedRoot = resolveAnsibleCatalogRoot();
  return cachedRoot;
}

/** Reset caches (tests / after sync). */
export function resetAnsibleCatalogCache(): void {
  cachedRoot = null;
  cachedGallery = null;
  cachedGalleryMtime = 0;
  cachedCollections = null;
  cachedByCollection = null;
  schemaCache.clear();
  schemaFileExistsCache.clear();
}

function rebuildCollectionIndex(items: AnsibleGalleryEntry[]): void {
  const by = new Map<string, AnsibleGalleryEntry[]>();
  for (const item of items) {
    const c = (item.collection || "other").trim() || "other";
    const list = by.get(c) ?? [];
    list.push(item);
    by.set(c, list);
  }
  for (const [, list] of by) {
    list.sort((a, b) => a.shortName.localeCompare(b.shortName) || a.fqcn.localeCompare(b.fqcn));
  }
  cachedByCollection = by;
  cachedCollections = [...by.entries()]
    .map(([name, list]) => ({ name, moduleCount: list.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function loadGalleryFromDisk(): AnsibleGalleryEntry[] {
  const root = getAnsibleCatalogRoot();
  const path = join(root, "gallery.json");
  if (!existsSync(path)) {
    cachedGallery = [];
    cachedGalleryMtime = 0;
    rebuildCollectionIndex([]);
    return [];
  }
  const st = statSync(path);
  if (cachedGallery && st.mtimeMs === cachedGalleryMtime) return cachedGallery;
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const items = Array.isArray(raw)
    ? (raw as AnsibleGalleryEntry[]).filter((x) => x && typeof x.fqcn === "string")
    : [];
  cachedGallery = items;
  cachedGalleryMtime = st.mtimeMs;
  rebuildCollectionIndex(items);
  return items;
}

export function listAnsibleGalleryFs(): AnsibleGalleryEntry[] {
  return loadGalleryFromDisk();
}

export function searchAnsibleGalleryFs(query: string, limit = 80): AnsibleGalleryEntry[] {
  return searchGalleryEntries(loadGalleryFromDisk(), query, limit);
}

/** All collections with module counts (sorted by name). */
export function listAnsibleCollectionsFs(): AnsibleCollectionSummary[] {
  loadGalleryFromDisk();
  return cachedCollections ?? [];
}

/** All modules in one collection (full list, sorted). */
export function listAnsibleModulesByCollectionFs(collection: string): AnsibleGalleryEntry[] {
  loadGalleryFromDisk();
  const key = (collection ?? "").trim();
  if (!key) return [];
  return cachedByCollection?.get(key) ?? [];
}

/** Cheap existence check for schema file (no full parse). */
export function ansibleSchemaFileExistsFs(fqcn: string): boolean {
  const key = (fqcn ?? "").trim();
  if (!key) return false;
  if (schemaFileExistsCache.has(key)) return schemaFileExistsCache.get(key)!;
  const root = getAnsibleCatalogRoot();
  const path = join(root, "schemas", `${key}.json`);
  const ok = existsSync(path);
  schemaFileExistsCache.set(key, ok);
  return ok;
}

export function getAnsibleModuleSchemaFs(fqcn: string): AnsibleModuleSchema | null {
  const key = (fqcn ?? "").trim();
  if (!key) return null;
  if (schemaCache.has(key)) return schemaCache.get(key) ?? null;

  const root = getAnsibleCatalogRoot();
  const path = join(root, "schemas", `${key}.json`);
  if (!existsSync(path)) {
    schemaCache.set(key, null);
    return null;
  }
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as AnsibleModuleSchema;
    if (!data.fqcn) data.fqcn = key;
    schemaCache.set(key, data);
    return data;
  } catch {
    schemaCache.set(key, null);
    return null;
  }
}

export function listAnsibleSchemaFqcnsFs(): string[] {
  const root = getAnsibleCatalogRoot();
  const dir = join(root, "schemas");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export function ansibleCatalogStats(): {
  root: string;
  galleryCount: number;
  schemaFileCount: number;
} {
  const root = getAnsibleCatalogRoot();
  const galleryCount = loadGalleryFromDisk().length;
  const schemaDir = join(root, "schemas");
  const schemaFileCount = existsSync(schemaDir)
    ? readdirSync(schemaDir).filter((f) => f.endsWith(".json")).length
    : 0;
  return { root, galleryCount, schemaFileCount };
}

/**
 * Browser-safe Ansible catalog helpers.
 * Gallery/schema data is loaded from the API (server uses catalog-fs).
 * Tests may use fallback fixtures via setAnsibleCatalogOverride.
 */
import type { AnsibleGalleryEntry, AnsibleModuleSchema } from "./types";
import {
  ansibleOptionToProperty,
  groupGalleryByCollection,
  schemaHasFormFields,
  schemaToProperties,
  searchGalleryEntries,
} from "./catalog-core";

export {
  ansibleOptionToProperty,
  groupGalleryByCollection,
  schemaHasFormFields,
  schemaToProperties,
  searchGalleryEntries,
} from "./catalog-core";

/** Optional in-memory override for unit tests (small fixture set). */
let galleryOverride: AnsibleGalleryEntry[] | null = null;
let schemaOverride: Record<string, AnsibleModuleSchema> | null = null;

export function setAnsibleCatalogOverride(
  opts: {
    gallery?: AnsibleGalleryEntry[];
    schemas?: Record<string, AnsibleModuleSchema>;
  } | null,
): void {
  if (!opts) {
    galleryOverride = null;
    schemaOverride = null;
    return;
  }
  if (opts.gallery) galleryOverride = opts.gallery;
  if (opts.schemas) schemaOverride = opts.schemas;
}

export function listAnsibleGallery(): AnsibleGalleryEntry[] {
  return galleryOverride ?? [];
}

export function searchAnsibleGallery(query: string, limit = 80): AnsibleGalleryEntry[] {
  return searchGalleryEntries(listAnsibleGallery(), query, limit);
}

export function getAnsibleModuleSchema(fqcn: string): AnsibleModuleSchema | null {
  const key = (fqcn ?? "").trim();
  if (!key) return null;
  return schemaOverride?.[key] ?? null;
}

export function listAnsibleSchemaFqcns(): string[] {
  return Object.keys(schemaOverride ?? {}).sort();
}

// Re-export types used by UI
export type { AnsibleGalleryEntry, AnsibleModuleSchema };

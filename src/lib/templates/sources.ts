/**
 * Load and merge template library sources.
 *
 * Order: config/template-sources.json
 *      → config/template-sources.local.json (gitignored)
 *      → OPENFLOW_TEMPLATE_SOURCES env JSON array/object
 *      → legacy N8N_LIBRARY_* overrides on default source
 */
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// src/lib/templates → repo root
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export type TemplateSource = {
  id: string;
  name: string;
  url?: string;
  ref: string;
  /** Local library root (skips git) */
  dir?: string;
  enabled: boolean;
  /** Lower = sync first */
  priority: number;
};

/** Default marketplace pack — ships with OpenFlow. */
export const DEFAULT_TEMPLATE_SOURCE: TemplateSource = {
  id: "n8n-community",
  name: "n8n Community Library",
  url: "https://github.com/real-limitless/n8n-workflow-library.git",
  ref: "main",
  enabled: true,
  priority: 100,
};

export function localSourcesPath(): string {
  return path.join(ROOT, "config/template-sources.local.json");
}

export function defaultSourcesPath(): string {
  return path.join(ROOT, "config/template-sources.json");
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export function normalizeTemplateSource(
  raw: unknown,
  fallbackId?: string,
): TemplateSource | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = (typeof o.id === "string" && o.id.trim()) || fallbackId || "";
  if (!id || id.includes(":") || id.includes("/")) {
    return null;
  }
  const name = (typeof o.name === "string" && o.name.trim()) || id;
  const url = typeof o.url === "string" && o.url.trim() ? o.url.trim() : undefined;
  const dir = typeof o.dir === "string" && o.dir.trim() ? o.dir.trim() : undefined;
  if (!url && !dir) return null;
  const ref =
    (typeof o.ref === "string" && o.ref.trim()) ||
    (typeof o.branch === "string" && o.branch.trim()) ||
    "main";
  const enabled =
    o.enabled === false || o.enabled === "false" || o.enabled === 0 ? false : true;
  const priority =
    typeof o.priority === "number" && Number.isFinite(o.priority)
      ? o.priority
      : typeof o.priority === "string"
        ? parseInt(o.priority, 10) || 100
        : 100;
  return { id, name, url, dir, ref, enabled, priority };
}

function mergeSources(
  base: Map<string, TemplateSource>,
  incoming: TemplateSource[],
): void {
  for (const s of incoming) {
    const prev = base.get(s.id);
    if (prev) {
      base.set(s.id, {
        ...prev,
        ...s,
        url: s.url ?? prev.url,
        dir: s.dir ?? prev.dir,
        name: s.name || prev.name,
      });
    } else {
      base.set(s.id, s);
    }
  }
}

async function readJsonFile(p: string): Promise<unknown | null> {
  if (!(await exists(p))) return null;
  try {
    return JSON.parse(await readFile(p, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function sourcesFromDoc(doc: unknown): TemplateSource[] {
  if (!doc) return [];
  if (Array.isArray(doc)) {
    return doc
      .map((x) => normalizeTemplateSource(x))
      .filter((x): x is TemplateSource => !!x);
  }
  if (typeof doc === "object" && doc !== null) {
    const sources = (doc as { sources?: unknown }).sources;
    if (Array.isArray(sources)) {
      return sources
        .map((x) => normalizeTemplateSource(x))
        .filter((x): x is TemplateSource => !!x);
    }
  }
  return [];
}

function applyLegacyEnv(map: Map<string, TemplateSource>): void {
  const repo = process.env.N8N_LIBRARY_REPO?.trim();
  const ref = process.env.N8N_LIBRARY_REF?.trim();
  const dir = process.env.N8N_LIBRARY_DIR?.trim();
  const def = map.get(DEFAULT_TEMPLATE_SOURCE.id) ?? { ...DEFAULT_TEMPLATE_SOURCE };
  if (repo) def.url = repo;
  if (ref) def.ref = ref;
  if (dir) def.dir = dir;
  map.set(DEFAULT_TEMPLATE_SOURCE.id, def);
}

export function templateRowId(sourceId: string, packId: string): string {
  return `${sourceId}:${packId}`;
}

export function parseTemplateRowId(
  id: string,
): { sourceId: string; packId: string } | null {
  const idx = id.indexOf(":");
  if (idx <= 0 || idx === id.length - 1) return null;
  return { sourceId: id.slice(0, idx), packId: id.slice(idx + 1) };
}

export async function loadTemplateSources(opts?: {
  onlyId?: string;
  includeDisabled?: boolean;
}): Promise<TemplateSource[]> {
  const map = new Map<string, TemplateSource>();
  map.set(DEFAULT_TEMPLATE_SOURCE.id, { ...DEFAULT_TEMPLATE_SOURCE });

  mergeSources(map, sourcesFromDoc(await readJsonFile(defaultSourcesPath())));
  mergeSources(map, sourcesFromDoc(await readJsonFile(localSourcesPath())));

  const envRaw = process.env.OPENFLOW_TEMPLATE_SOURCES?.trim();
  if (envRaw) {
    try {
      mergeSources(map, sourcesFromDoc(JSON.parse(envRaw) as unknown));
    } catch (e) {
      console.warn(
        "OPENFLOW_TEMPLATE_SOURCES is not valid JSON:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  applyLegacyEnv(map);

  let list = [...map.values()].sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  );

  if (!opts?.includeDisabled) {
    list = list.filter((s) => s.enabled);
  }
  if (opts?.onlyId) {
    list = list.filter((s) => s.id === opts.onlyId);
  }
  return list;
}

/** Read only the local override file (not merged defaults). */
export async function readLocalSourcesFile(): Promise<TemplateSource[]> {
  return sourcesFromDoc(await readJsonFile(localSourcesPath()));
}

/** Persist operator overrides (does not rewrite shipped defaults). */
export async function writeLocalSourcesFile(sources: TemplateSource[]): Promise<void> {
  const p = localSourcesPath();
  await mkdir(path.dirname(p), { recursive: true });
  const body = {
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      ...(s.url ? { url: s.url } : {}),
      ...(s.dir ? { dir: s.dir } : {}),
      ref: s.ref,
      enabled: s.enabled,
      priority: s.priority,
    })),
  };
  await writeFile(p, JSON.stringify(body, null, 2) + "\n", "utf8");
}

export async function upsertLocalSource(source: TemplateSource): Promise<TemplateSource[]> {
  const list = await readLocalSourcesFile();
  const idx = list.findIndex((s) => s.id === source.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...source };
  else list.push(source);
  await writeLocalSourcesFile(list);
  return list;
}

export async function removeLocalSource(id: string): Promise<TemplateSource[]> {
  const list = (await readLocalSourcesFile()).filter((s) => s.id !== id);
  await writeLocalSourcesFile(list);
  return list;
}

export function projectRoot(): string {
  return ROOT;
}

/** Slugify a git URL or name into a source id. */
export function suggestSourceId(input: string): string {
  const s = input
    .trim()
    .replace(/\.git$/i, "")
    .replace(/https?:\/\//i, "")
    .replace(/github\.com\//i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
  return s || "custom-library";
}

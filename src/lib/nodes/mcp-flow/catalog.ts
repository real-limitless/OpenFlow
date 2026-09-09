/**
 * OpenFlow reads mcp-flow catalog-data (McpGalleryEntry shards), not a second gallery.
 *
 * Resolution order:
 *   1. MCP_FLOW_CATALOG_DIR (local index.json + entries/)
 *   2. MCP_FLOW_CATALOG_URL (default GitHub Pages catalog tree)
 *   3. MCP_FLOW_URL + MCP_FLOW_ADMIN_TOKEN (gateway /v1/catalog/search)
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  McpGalleryEntry,
  McpGalleryIndex,
  McpGalleryIndexRow,
  McpGalleryTransport,
} from "./types";
import { MCP_GALLERY_SCHEMA_VERSION } from "./types";

export const DEFAULT_MCP_CATALOG_URL =
  "https://real-limitless.github.io/mcp-flow/catalog";

const DEFAULT_MCP_FLOW_URL = "http://127.0.0.1:8787";

let cachedIndex: McpGalleryIndexRow[] | null = null;
let cachedFrom = "";

export function mcpFlowUrl(): string {
  return (process.env.MCP_FLOW_URL || DEFAULT_MCP_FLOW_URL).replace(/\/+$/, "");
}

export function mcpCatalogUrl(): string {
  return (process.env.MCP_FLOW_CATALOG_URL || DEFAULT_MCP_CATALOG_URL).replace(/\/+$/, "");
}

export function mcpCatalogDir(): string | null {
  const env = process.env.MCP_FLOW_CATALOG_DIR?.trim();
  if (!env) return null;
  const p = resolve(env);
  return existsSync(join(p, "index.json")) ? p : null;
}

export function entryFilename(id: string): string {
  const base = id
    .trim()
    .replace(/\//g, "--")
    .replace(/[^a-zA-Z0-9._@+-]/g, "_");
  return `${base || "unknown"}.json`;
}

export function resetMcpGalleryCache(): void {
  cachedIndex = null;
  cachedFrom = "";
}

export function searchMcpIndex(
  rows: McpGalleryIndexRow[],
  query: string,
  limit = 50,
): McpGalleryIndexRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: McpGalleryIndexRow[] = [];
  for (const row of rows) {
    const hay = `${row.id} ${row.title} ${row.summary}`.toLowerCase();
    if (hay.includes(q)) hits.push(row);
    if (hits.length >= limit) break;
  }
  return hits;
}

function parseIndex(raw: unknown): McpGalleryIndexRow[] {
  if (!raw || typeof raw !== "object") return [];
  const entries = (raw as McpGalleryIndex).entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter((e) => e && typeof e.id === "string");
}

function readLocalIndex(dir: string): McpGalleryIndexRow[] {
  const path = join(dir, "index.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseIndex(parsed);
}

function readLocalEntry(dir: string, id: string): McpGalleryEntry | null {
  const path = join(dir, "entries", entryFilename(id));
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as McpGalleryEntry;
}

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

export async function loadMcpGalleryIndex(): Promise<{
  entries: McpGalleryIndexRow[];
  source: string;
  schemaVersion: string;
}> {
  const dir = mcpCatalogDir();
  const sourceKey = dir || mcpCatalogUrl();
  if (cachedIndex && cachedFrom === sourceKey) {
    return {
      entries: cachedIndex,
      source: sourceKey,
      schemaVersion: MCP_GALLERY_SCHEMA_VERSION,
    };
  }

  let entries: McpGalleryIndexRow[] = [];
  if (dir) {
    entries = readLocalIndex(dir);
  } else {
    const url = `${mcpCatalogUrl()}/index.json`;
    const parsed = await fetchJson<McpGalleryIndex>(url);
    entries = parseIndex(parsed);
  }

  cachedIndex = entries;
  cachedFrom = sourceKey;
  return { entries, source: sourceKey, schemaVersion: MCP_GALLERY_SCHEMA_VERSION };
}

export async function getMcpGalleryEntry(id: string): Promise<McpGalleryEntry | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const dir = mcpCatalogDir();
  if (dir) return readLocalEntry(dir, trimmed);

  const file = entryFilename(trimmed);
  try {
    return await fetchJson<McpGalleryEntry>(`${mcpCatalogUrl()}/entries/${file}`);
  } catch {
    return null;
  }
}

type GatewaySearchResponse = {
  entries?: Array<{
    id: string;
    title: string;
    description?: string;
    summary?: string;
    transport?: McpGalleryTransport;
    endpointUrl?: string;
    flags?: string[];
    version?: string;
    status?: string;
  }>;
  source?: string;
};

export async function searchMcpGallery(
  query: string,
  limit = 50,
): Promise<{
  items: McpGalleryIndexRow[];
  total: number;
  source: string;
}> {
  const q = query.trim();
  const token = process.env.MCP_FLOW_ADMIN_TOKEN?.trim();
  if (token && q) {
    try {
      const sp = new URLSearchParams({ q, live: "0" });
      const data = await fetchJson<GatewaySearchResponse>(
        `${mcpFlowUrl()}/v1/catalog/search?${sp}`,
        { Authorization: `Bearer ${token}`, Accept: "application/json" },
      );
      const items = (data.entries ?? []).slice(0, limit).map((e) => ({
        id: e.id,
        title: e.title,
        summary: e.summary || e.description || "",
        transport: e.transport || "unknown",
        endpointUrl: e.endpointUrl,
        flags: e.flags,
        version: e.version,
        status: e.status,
      }));
      return { items, total: items.length, source: data.source || "mcp-flow-gateway" };
    } catch {
      /* fall through to catalog-data */
    }
  }

  const { entries, source } = await loadMcpGalleryIndex();
  const items = searchMcpIndex(entries, q, limit);
  return { items, total: entries.length, source };
}

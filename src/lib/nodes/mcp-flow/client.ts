import { apiFetch } from "@/lib/auth/client";
import type { McpGalleryEntry, McpGalleryIndexRow } from "./types";

export async function fetchMcpGallery(opts?: {
  q?: string;
  limit?: number;
}): Promise<{
  count: number;
  total: number;
  items: McpGalleryIndexRow[];
  source?: string;
  message?: string;
}> {
  const sp = new URLSearchParams();
  if (opts?.q) sp.set("q", opts.q);
  if (opts?.limit != null) sp.set("limit", String(opts.limit));
  const res = await apiFetch(`/api/v1/mcp-gallery?${sp}`);
  if (!res.ok) throw new Error(`mcp-gallery ${res.status}`);
  return res.json() as Promise<{
    count: number;
    total: number;
    items: McpGalleryIndexRow[];
    source?: string;
    message?: string;
    error?: string;
  }>;
}

export async function fetchMcpGalleryEntry(id: string): Promise<McpGalleryEntry | null> {
  const res = await apiFetch(`/api/v1/mcp-gallery/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`mcp-gallery entry ${res.status}`);
  const data = (await res.json()) as { entry?: McpGalleryEntry };
  return data.entry ?? null;
}

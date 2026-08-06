import { projectHeaders } from "@/lib/projects/client";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

function apiUrl(path: string): string {
  if (!API_BASE) return path;
  return `${API_BASE.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export type CompatLevel = "ready" | "partial" | "limited";

export type TemplateListItem = {
  id: string;
  sourceId: string;
  sourceName: string | null;
  packId: string;
  externalId: number | null;
  name: string;
  descriptionSnippet: string;
  imageUrl: string | null;
  views: number;
  recentViews: number;
  nodeCount: number;
  nodeTypes: string[];
  categories: string[];
  authorName: string | null;
  authorUsername: string | null;
  authorAvatar: string | null;
  sourceUrl: string | null;
  libraryUrl: string | null;
  readyToDemo: boolean;
  publishedAt: string | null;
  syncedAt: string;
  compatibility: {
    level: CompatLevel;
    ratio: number;
    supportedCount: number;
    missingCount: number;
    total: number;
  };
};

export type TemplateDetail = TemplateListItem & {
  description: string | null;
  compatibility: TemplateListItem["compatibility"] & {
    supported: string[];
    missing: string[];
  };
};

export type FacetsResponse = {
  total: number;
  categories: Array<{ name: string; count: number }>;
  sources: Array<{ id: string; name: string; count: number }>;
};

export type ListParams = {
  q?: string;
  category?: string;
  source?: string;
  sort?: "popular" | "recent";
  compat?: CompatLevel | "any";
  page?: number;
  pageSize?: number;
};

export async function fetchTemplateFacets(): Promise<FacetsResponse> {
  const res = await fetch(apiUrl("/api/v1/templates/facets"), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Facets failed: ${res.status}`);
  return res.json() as Promise<FacetsResponse>;
}

export async function fetchTemplates(params: ListParams = {}): Promise<{
  page: number;
  pageSize: number;
  total: number;
  items: TemplateListItem[];
}> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.category) sp.set("category", params.category);
  if (params.source) sp.set("source", params.source);
  if (params.sort) sp.set("sort", params.sort);
  if (params.compat && params.compat !== "any") sp.set("compat", params.compat);
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  const qs = sp.toString();
  const res = await fetch(apiUrl(`/api/v1/templates${qs ? `?${qs}` : ""}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`List templates failed: ${res.status}`);
  return res.json();
}

export async function fetchTemplate(id: string): Promise<TemplateDetail> {
  const res = await fetch(apiUrl(`/api/v1/templates/${encodeURIComponent(id)}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(res.status === 404 ? "Template not found" : `Load failed: ${res.status}`);
  return res.json() as Promise<TemplateDetail>;
}

export async function importTemplate(
  id: string,
  projectId?: string | null,
): Promise<{ id: string; name: string }> {
  const res = await fetch(apiUrl(`/api/v1/templates/${encodeURIComponent(id)}/import`), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...projectHeaders(),
    },
    body: JSON.stringify(projectId ? { projectId } : {}),
  });
  if (res.status === 401) {
    const err = new Error("Authentication required") as Error & { status: number };
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Import failed: ${res.status}`);
  }
  return res.json() as Promise<{ id: string; name: string }>;
}

export function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

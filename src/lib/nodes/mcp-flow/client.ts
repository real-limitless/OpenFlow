import { apiFetch } from "@/lib/auth/client";
import type {
  McpGalleryEntry,
  McpGalleryIndexRow,
  McpFlowBackend,
  McpFlowConnectionPublic,
  McpFlowProject,
  McpFlowToolPreview,
} from "./types";

export async function fetchMcpGallery(opts?: { q?: string; limit?: number }): Promise<{
  count: number;
  total: number;
  items: McpGalleryIndexRow[];
  source?: string;
  message?: string;
  error?: string;
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

export type McpFlowConnectionResponse = {
  connected: boolean;
  credential?: McpFlowConnectionPublic;
};

export async function fetchMcpFlowConnection(): Promise<McpFlowConnectionResponse> {
  const res = await apiFetch("/api/v1/mcp-flow/connection");
  if (!res.ok) throw new Error(`mcp-flow connection ${res.status}`);
  return res.json() as Promise<McpFlowConnectionResponse>;
}

export async function saveMcpFlowConnection(input: {
  url: string;
  apiKey: string;
  name?: string;
}): Promise<McpFlowConnectionPublic> {
  const res = await apiFetch("/api/v1/mcp-flow/connection", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `mcp-flow save ${res.status}`);
  }
  return res.json() as Promise<McpFlowConnectionPublic>;
}

export async function deleteMcpFlowConnection(credentialId?: string): Promise<void> {
  const sp = new URLSearchParams();
  if (credentialId) sp.set("credentialId", credentialId);
  const q = sp.toString();
  const res = await apiFetch(`/api/v1/mcp-flow/connection${q ? `?${q}` : ""}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `mcp-flow disconnect ${res.status}`);
  }
}

export async function fetchMcpFlowStatus(opts?: {
  credentialId?: string;
  project?: string;
}): Promise<unknown> {
  const sp = new URLSearchParams();
  if (opts?.credentialId) sp.set("credentialId", opts.credentialId);
  if (opts?.project) sp.set("project", opts.project);
  const res = await apiFetch(`/api/v1/mcp-flow/status?${sp}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `mcp-flow status ${res.status}`);
  }
  return res.json();
}

export async function fetchMcpFlowProjects(opts?: {
  credentialId?: string;
}): Promise<{ items: McpFlowProject[] }> {
  const sp = new URLSearchParams();
  if (opts?.credentialId) sp.set("credentialId", opts.credentialId);
  const res = await apiFetch(`/api/v1/mcp-flow/projects?${sp}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `mcp-flow projects ${res.status}`);
  }
  return res.json() as Promise<{ items: McpFlowProject[] }>;
}

export async function fetchMcpFlowBackends(opts?: {
  credentialId?: string;
  project?: string;
}): Promise<{ items: McpFlowBackend[]; project?: unknown }> {
  const sp = new URLSearchParams();
  if (opts?.credentialId) sp.set("credentialId", opts.credentialId);
  if (opts?.project) sp.set("project", opts.project);
  const res = await apiFetch(`/api/v1/mcp-flow/backends?${sp}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `mcp-flow backends ${res.status}`);
  }
  return res.json() as Promise<{ items: McpFlowBackend[]; project?: unknown }>;
}

export async function fetchMcpFlowTools(opts?: {
  credentialId?: string;
  project?: string;
  backend?: string;
}): Promise<{ items: McpFlowToolPreview[] }> {
  const sp = new URLSearchParams();
  if (opts?.credentialId) sp.set("credentialId", opts.credentialId);
  if (opts?.project) sp.set("project", opts.project);
  if (opts?.backend) sp.set("backend", opts.backend);
  const res = await apiFetch(`/api/v1/mcp-flow/tools?${sp}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `mcp-flow tools ${res.status}`);
  }
  return res.json() as Promise<{ items: McpFlowToolPreview[] }>;
}

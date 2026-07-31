import {
  getSelectedProjectId,
  projectHeaders,
} from "@/lib/projects/client";

const KEY = "openflow.currentEnvironmentId";

export type EnvironmentSummary = {
  id: string;
  projectId: string | null;
  name: string;
  slug: string;
  isDefault: boolean;
  sortOrder: number;
};

export function getSelectedEnvironmentId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setSelectedEnvironmentId(id: string | null) {
  if (typeof window === "undefined") return;
  if (!id) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, id);
}

export function environmentHeaders(extra?: HeadersInit): HeadersInit {
  const headers = new Headers(extra);
  const id = getSelectedEnvironmentId();
  if (id) headers.set("X-OpenFlow-Environment", id);
  return headers;
}

/** Project + environment request headers. */
export function scopeHeaders(extra?: HeadersInit): HeadersInit {
  return environmentHeaders(projectHeaders(extra));
}

export async function fetchEnvironments(projectId?: string | null): Promise<EnvironmentSummary[]> {
  const headers = projectHeaders();
  const pid = projectId ?? getSelectedProjectId();
  const q = pid ? `?projectId=${encodeURIComponent(pid)}` : "";
  const res = await fetch(`/api/v1/environments${q}`, { headers });
  if (!res.ok) return [];
  return (await res.json()) as EnvironmentSummary[];
}

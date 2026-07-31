const KEY = "openflow.currentProjectId";

export type ProjectSummary = {
  id: string;
  name: string;
  type: string;
  role: string;
};

export function getSelectedProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setSelectedProjectId(id: string | null) {
  if (typeof window === "undefined") return;
  if (!id) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, id);
}

export function projectHeaders(extra?: HeadersInit): HeadersInit {
  const headers = new Headers(extra);
  const id = getSelectedProjectId();
  if (id) headers.set("X-OpenFlow-Project", id);
  // Environment header when available (avoid circular import by reading storage directly)
  if (typeof window !== "undefined") {
    const envId = window.localStorage.getItem("openflow.currentEnvironmentId");
    if (envId) headers.set("X-OpenFlow-Environment", envId);
  }
  return headers;
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const res = await fetch("/api/v1/projects", { headers: projectHeaders() });
  if (!res.ok) return [];
  return (await res.json()) as ProjectSummary[];
}

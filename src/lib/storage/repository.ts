import type { IWorkflow } from "../workflow/types";
import { getSelectedProjectId, projectHeaders } from "../projects/client";

/**
 * Repository abstraction.
 * Default: API (Postgres) via same-origin `/api/v1`.
 * Optional: browser localStorage when VITE_USE_LOCAL_STORAGE=true or API unreachable.
 */
export interface WorkflowRepository {
  readonly kind: "api" | "local";
  list(): Promise<IWorkflow[]>;
  get(id: string): Promise<IWorkflow | null>;
  /** Persist and return the canonical workflow (server may assign/confirm id). */
  save(workflow: IWorkflow): Promise<IWorkflow>;
  remove(id: string): Promise<void>;
}

const KEY = "openflow.workflows.v1";

function readAll(): Record<string, IWorkflow> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, IWorkflow>;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, IWorkflow>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

export const localRepository: WorkflowRepository = {
  kind: "local",
  async list() {
    return Object.values(readAll()).sort((a, b) =>
      String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
    );
  },
  async get(id) {
    return readAll()[id] ?? null;
  },
  async save(workflow) {
    const all = readAll();
    const saved = { ...workflow, updatedAt: new Date().toISOString() };
    all[workflow.id] = saved;
    writeAll(all);
    return saved;
  },
  async remove(id) {
    const all = readAll();
    delete all[id];
    writeAll(all);
  },
};

/** Empty string = same-origin relative URLs (works with Vite proxy / docker same host). */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

function apiUrl(path: string): string {
  if (!API_BASE) return path;
  return `${API_BASE.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export const apiRepository: WorkflowRepository = {
  kind: "api",
  async list() {
    const res = await fetch(apiUrl("/api/v1/workflows"), { headers: projectHeaders() });
    if (!res.ok) throw new Error(`List failed: ${res.status}`);
    const rows = (await res.json()) as Array<Partial<IWorkflow> & { id: string; name: string }>;
    // List endpoint returns summaries; map to IWorkflow-shaped objects for the home page
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      active: Boolean(r.active),
      nodes: Array.isArray(r.nodes) ? r.nodes : [],
      connections: (r.connections as IWorkflow["connections"]) ?? {},
      settings: r.settings ?? {},
      updatedAt: r.updatedAt,
      nodeCount: (r as { nodeCount?: number }).nodeCount,
    })) as IWorkflow[];
  },
  async get(id: string) {
    const res = await fetch(apiUrl(`/api/v1/workflows/${id}`), { headers: projectHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Get failed: ${res.status}`);
    return res.json() as Promise<IWorkflow>;
  },
  async save(workflow: IWorkflow) {
    const projectId = getSelectedProjectId();
    const payload = projectId ? { ...workflow, projectId } : workflow;
    // Upsert: try PUT first when id present; on 404 create with client id via POST
    if (workflow.id) {
      const putRes = await fetch(apiUrl(`/api/v1/workflows/${workflow.id}`), {
        method: "PUT",
        headers: projectHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      if (putRes.ok) {
        return (await putRes.json()) as IWorkflow;
      }
      if (putRes.status !== 404) {
        const text = await putRes.text().catch(() => "");
        throw new Error(`Save failed: ${putRes.status} ${text}`);
      }
    }

    const postRes = await fetch(apiUrl("/api/v1/workflows"), {
      method: "POST",
      headers: projectHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (!postRes.ok) {
      const text = await postRes.text().catch(() => "");
      throw new Error(`Create failed: ${postRes.status} ${text}`);
    }
    return (await postRes.json()) as IWorkflow;
  },
  async remove(id: string) {
    const res = await fetch(apiUrl(`/api/v1/workflows/${id}`), {
      method: "DELETE",
      headers: projectHeaders(),
    });
    if (!res.ok && res.status !== 404) throw new Error(`Delete failed: ${res.status}`);
  },
};

function preferLocalStorage(): boolean {
  return (
    import.meta.env.VITE_USE_LOCAL_STORAGE === "true" ||
    import.meta.env.VITE_USE_LOCAL_STORAGE === "1"
  );
}

let cached: WorkflowRepository | null = null;
let apiHealthy: boolean | null = null;

export async function probeApi(): Promise<boolean> {
  if (preferLocalStorage()) {
    apiHealthy = false;
    return false;
  }
  try {
    const res = await fetch(apiUrl("/health"), { method: "GET" });
    apiHealthy = res.ok;
  } catch {
    apiHealthy = false;
  }
  return apiHealthy;
}

export function getRepository(): WorkflowRepository {
  if (preferLocalStorage()) return localRepository;
  // Default to API (same-origin). Execution always hits DB; keep editor on the same store.
  if (cached) return cached;
  cached = apiRepository;
  return cached;
}

export function getStorageKind(): "api" | "local" {
  return getRepository().kind;
}

/**
 * Push every localStorage workflow into the API (upsert by id).
 * Returns how many were written.
 */
export async function migrateLocalToApi(): Promise<number> {
  const local = await localRepository.list();
  if (local.length === 0) return 0;
  let n = 0;
  for (const wf of local) {
    await apiRepository.save(wf);
    n++;
  }
  return n;
}

/** Count local-only workflows (for UI banner). */
export async function countLocalWorkflows(): Promise<number> {
  return (await localRepository.list()).length;
}

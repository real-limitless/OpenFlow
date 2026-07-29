import type { IWorkflow } from "../workflow/types";

/**
 * Repository abstraction. Phase 1 stores everything in the browser.
 * Swapping to a server-backed store later is a single implementation change.
 */
export interface WorkflowRepository {
  list(): Promise<IWorkflow[]>;
  get(id: string): Promise<IWorkflow | null>;
  save(workflow: IWorkflow): Promise<void>;
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
    all[workflow.id] = { ...workflow, updatedAt: new Date().toISOString() };
    writeAll(all);
  },
  async remove(id) {
    const all = readAll();
    delete all[id];
    writeAll(all);
  },
};

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const apiRepository: WorkflowRepository = {
  async list() {
    const res = await fetch(`${API_BASE}/api/v1/workflows`);
    if (!res.ok) throw new Error(`List failed: ${res.status}`);
    return res.json();
  },
  async get(id: string) {
    const res = await fetch(`${API_BASE}/api/v1/workflows/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Get failed: ${res.status}`);
    return res.json();
  },
  async save(workflow: IWorkflow) {
    const method = workflow.id ? "PUT" : "POST";
    const url = workflow.id
      ? `${API_BASE}/api/v1/workflows/${workflow.id}`
      : `${API_BASE}/api/v1/workflows`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflow),
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  },
  async remove(id: string) {
    const res = await fetch(`${API_BASE}/api/v1/workflows/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  },
};

export function getRepository(): WorkflowRepository {
  return API_BASE ? apiRepository : localRepository;
}

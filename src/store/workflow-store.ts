import { create } from "zustand";
import type { INode, IWorkflow } from "@/lib/workflow/types";
import { EMPTY_WORKFLOW } from "@/lib/workflow/types";
import {
  addConnection,
  removeConnectionById,
  removeNodeConnections,
  renameInConnections,
  uniqueNodeName,
} from "@/lib/workflow/graph";
import { defaultParameters } from "@/lib/workflow/mutations";
import { getNodeType } from "@/lib/nodes/registry";
import { newId } from "@/lib/workflow/schema";
import { getRepository } from "@/lib/storage/repository";

interface HistoryEntry {
  workflow: IWorkflow;
}

interface WorkflowState {
  workflow: IWorkflow;
  selectedNode: string | null;
  dirty: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];

  load: (workflow: IWorkflow) => void;
  /** Apply server/assistant snapshot without wiping selection when possible. */
  applyRemote: (workflow: IWorkflow, options?: { selectNode?: string | null }) => void;
  reset: () => void;
  commit: (updater: (draft: IWorkflow) => IWorkflow, options?: { history?: boolean }) => void;
  commitCoalesced: (key: string, updater: (draft: IWorkflow) => IWorkflow) => void;

  setName: (name: string) => void;
  setActive: (active: boolean) => void;
  selectNode: (name: string | null) => void;

  addNode: (type: string, position: { x: number; y: number }) => string;
  duplicateNode: (name: string) => void;
  deleteNode: (name: string) => void;
  moveNode: (name: string, position: { x: number; y: number }) => void;
  renameNode: (from: string, to: string) => void;
  toggleDisabled: (name: string) => void;
  updateParameters: (name: string, parameters: Record<string, unknown>) => void;
  updateCredentials: (name: string, credentials: INode["credentials"] | null) => void;
  setNodeNotes: (name: string, notes: string) => void;
  setPinData: (name: string, items: Array<{ json: Record<string, unknown> }> | null) => void;

  connect: (
    source: string,
    sourceHandle: string | null | undefined,
    target: string,
    targetHandle: string | null | undefined,
  ) => void;
  disconnect: (edgeId: string) => void;
  insertNodeOnEdge: (edgeId: string, type: string) => void;

  undo: () => void;
  redo: () => void;
  persist: () => Promise<void>;
  markSaved: () => void;
}

export { defaultParameters } from "@/lib/workflow/mutations";

const HISTORY_LIMIT = 60;

let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
let coalesceKey: string | null = null;
const COALESCE_MS = 400;

function clearCoalesce(): void {
  if (coalesceTimer) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
  coalesceKey = null;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflow: EMPTY_WORKFLOW("draft"),
  selectedNode: null,
  dirty: false,
  past: [],
  future: [],

  load: (workflow) => set({ workflow, selectedNode: null, past: [], future: [], dirty: false }),
  applyRemote: (workflow, options) => {
    const selected = get().selectedNode;
    const names = new Set(workflow.nodes.map((n) => n.name));
    const keep =
      options?.selectNode !== undefined
        ? options.selectNode
        : selected && names.has(selected)
          ? selected
          : null;
    set({
      workflow,
      selectedNode: keep,
      dirty: false,
      past: [],
      future: [],
    });
  },
  reset: () =>
    set({ workflow: EMPTY_WORKFLOW(newId("wf")), selectedNode: null, past: [], future: [] }),

  commit: (updater, options) => {
    const { workflow, past } = get();
    const next = updater(workflow);
    set({
      workflow: next,
      dirty: true,
      past: options?.history === false ? past : [...past, { workflow }].slice(-HISTORY_LIMIT),
      future: [],
    });
  },

  commitCoalesced: (key, updater) => {
    const continuing = coalesceKey === key && coalesceTimer !== null;
    if (continuing) {
      get().commit(updater, { history: false });
    } else {
      clearCoalesce();
      get().commit(updater);
      coalesceKey = key;
    }
    if (coalesceTimer) clearTimeout(coalesceTimer);
    coalesceTimer = setTimeout(() => {
      coalesceTimer = null;
      coalesceKey = null;
    }, COALESCE_MS);
  },

  setName: (name) => get().commitCoalesced("name", (wf) => ({ ...wf, name })),
  setActive: (active) => get().commit((wf) => ({ ...wf, active })),
  selectNode: (name) => set({ selectedNode: name }),

  addNode: (type, position) => {
    const description = getNodeType(type);
    const existing = get().workflow.nodes.map((n) => n.name);
    const name = uniqueNodeName(existing, description.defaults.name);
    const node: INode = {
      id: newId("node"),
      name,
      type,
      typeVersion: Array.isArray(description.version)
        ? description.version[description.version.length - 1]
        : description.version,
      position: [Math.round(position.x), Math.round(position.y)],
      parameters: defaultParameters(description.properties),
    };
    get().commit((wf) => ({ ...wf, nodes: [...wf.nodes, node] }));
    set({ selectedNode: name });
    return name;
  },

  duplicateNode: (name) => {
    const source = get().workflow.nodes.find((n) => n.name === name);
    if (!source) return;
    const existing = get().workflow.nodes.map((n) => n.name);
    const copyName = uniqueNodeName(existing, `${source.name} copy`);
    const clone: INode = {
      ...structuredClone(source),
      id: newId("node"),
      name: copyName,
      position: [source.position[0] + 60, source.position[1] + 60],
    };
    get().commit((wf) => ({ ...wf, nodes: [...wf.nodes, clone] }));
    set({ selectedNode: copyName });
  },

  deleteNode: (name) => {
    get().commit((wf) => ({
      ...wf,
      nodes: wf.nodes.filter((n) => n.name !== name),
      connections: removeNodeConnections(wf.connections, name),
      pinData: Object.fromEntries(Object.entries(wf.pinData ?? {}).filter(([key]) => key !== name)),
    }));
    if (get().selectedNode === name) set({ selectedNode: null });
  },

  moveNode: (name, position) =>
    get().commit(
      (wf) => ({
        ...wf,
        nodes: wf.nodes.map((n) =>
          n.name === name
            ? {
                ...n,
                position: [Math.round(position.x), Math.round(position.y)] as [number, number],
              }
            : n,
        ),
      }),
      { history: false },
    ),

  renameNode: (from, to) => {
    const trimmed = to.trim();
    if (!trimmed || trimmed === from) return;
    const existing = get()
      .workflow.nodes.map((n) => n.name)
      .filter((n) => n !== from);
    const finalName = uniqueNodeName(existing, trimmed);
    get().commit((wf) => ({
      ...wf,
      nodes: wf.nodes.map((n) => (n.name === from ? { ...n, name: finalName } : n)),
      connections: renameInConnections(wf.connections, from, finalName),
    }));
    set({ selectedNode: finalName });
  },

  toggleDisabled: (name) =>
    get().commit((wf) => ({
      ...wf,
      nodes: wf.nodes.map((n) => (n.name === name ? { ...n, disabled: !n.disabled } : n)),
    })),

  updateParameters: (name, parameters) =>
    get().commitCoalesced(`params:${name}`, (wf) => ({
      ...wf,
      nodes: wf.nodes.map((n) => (n.name === name ? { ...n, parameters } : n)),
    })),

  updateCredentials: (name, credentials) =>
    get().commit((wf) => ({
      ...wf,
      nodes: wf.nodes.map((n) => {
        if (n.name !== name) return n;
        if (credentials == null || Object.keys(credentials).length === 0) {
          const { credentials: _drop, ...rest } = n;
          return rest as INode;
        }
        return { ...n, credentials };
      }),
    })),

  setNodeNotes: (name, notes) =>
    get().commit((wf) => ({
      ...wf,
      nodes: wf.nodes.map((n) => (n.name === name ? { ...n, notes } : n)),
    })),

  setPinData: (name, items) =>
    get().commit((wf) => {
      const pinData = { ...(wf.pinData ?? {}) };
      if (items === null) delete pinData[name];
      else pinData[name] = items;
      return { ...wf, pinData };
    }),

  connect: (source, sourceHandle, target, targetHandle) =>
    get().commit((wf) => ({
      ...wf,
      connections: addConnection(wf.connections, source, sourceHandle, target, targetHandle),
    })),

  disconnect: (edgeId) =>
    get().commit((wf) => ({ ...wf, connections: removeConnectionById(wf.connections, edgeId) })),

  insertNodeOnEdge: (edgeId, type) => {
    const match = /^(.+?)::(.+?)::(\d+)->(.+?)::(\d+)$/.exec(edgeId);
    if (!match) return;
    const [, source, channel, outStr, target, inStr] = match;
    const outputIndex = Number(outStr);
    const inputIndex = Number(inStr);

    const wf = get().workflow;
    const sourceNode = wf.nodes.find((n) => n.name === source);
    const targetNode = wf.nodes.find((n) => n.name === target);
    if (!sourceNode || !targetNode) return;

    let targetType = "main";
    const outputs = wf.connections?.[source]?.[channel]?.[outputIndex];
    const conn = outputs?.find((t) => t.node === target && (t.index ?? 0) === inputIndex);
    if (conn?.type) targetType = conn.type;

    const description = getNodeType(type);
    const existing = wf.nodes.map((n) => n.name);
    const name = uniqueNodeName(existing, description.defaults.name);
    const midX = Math.round((sourceNode.position[0] + targetNode.position[0]) / 2);
    const midY = Math.round((sourceNode.position[1] + targetNode.position[1]) / 2);
    const node: INode = {
      id: newId("node"),
      name,
      type,
      typeVersion: Array.isArray(description.version)
        ? description.version[description.version.length - 1]
        : description.version,
      position: [midX, midY],
      parameters: defaultParameters(description.properties),
    };

    get().commit((w) => {
      let connections = removeConnectionById(w.connections, edgeId);
      connections = addConnection(connections, source, `${channel}-${outputIndex}`, name, "main-0");
      connections = addConnection(
        connections,
        name,
        "main-0",
        target,
        `${targetType}-${inputIndex}`,
      );
      return { ...w, nodes: [...w.nodes, node], connections };
    });
    set({ selectedNode: name });
  },

  undo: () => {
    clearCoalesce();
    const { past, future, workflow } = get();
    if (!past.length) return;
    const previous = past[past.length - 1];
    set({
      workflow: previous.workflow,
      past: past.slice(0, -1),
      future: [{ workflow }, ...future].slice(0, HISTORY_LIMIT),
      dirty: true,
    });
  },

  redo: () => {
    clearCoalesce();
    const { past, future, workflow } = get();
    if (!future.length) return;
    const [next, ...rest] = future;
    set({
      workflow: next.workflow,
      past: [...past, { workflow }].slice(-HISTORY_LIMIT),
      future: rest,
      dirty: true,
    });
  },

  persist: async () => {
    const current = get().workflow;
    const saved = await getRepository().save(current);
    // Keep editor graph; adopt server-confirmed id / timestamps
    set({
      workflow: {
        ...current,
        id: saved.id || current.id,
        name: saved.name ?? current.name,
        active: saved.active ?? current.active,
        updatedAt: saved.updatedAt ?? current.updatedAt,
        versionId: saved.versionId ?? current.versionId,
      },
      dirty: false,
    });
  },

  markSaved: () => set({ dirty: false }),
}));

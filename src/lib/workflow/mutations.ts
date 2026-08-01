import type { INode, INodeCredentialRef, INodeExecutionData, IWorkflow } from "./types";
import {
  addConnection,
  removeConnectionById,
  removeNodeConnections,
  renameInConnections,
  uniqueNodeName,
} from "./graph";
import { getNodeType } from "../nodes/registry";
import type { INodeProperties } from "../nodes/types";
import { newId } from "./schema";

export function defaultParameters(properties: INodeProperties[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const prop of properties) {
    if (prop.type === "notice") continue;
    out[prop.name] = prop.default;
  }
  return out;
}

export type MutationResult<T = unknown> = {
  workflow: IWorkflow;
  result: T;
};

function requireNode(wf: IWorkflow, name: string): INode {
  const node = wf.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`Node not found: ${name}`);
  return node;
}

export function addNode(
  wf: IWorkflow,
  type: string,
  position: { x: number; y: number },
  preferredName?: string,
): MutationResult<{ name: string; id: string }> {
  const description = getNodeType(type);
  const existing = wf.nodes.map((n) => n.name);
  const base = preferredName?.trim() || description.defaults.name;
  const name = uniqueNodeName(existing, base);
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
  return {
    workflow: { ...wf, nodes: [...wf.nodes, node] },
    result: { name, id: node.id },
  };
}

export function deleteNode(wf: IWorkflow, name: string): MutationResult<{ deleted: string }> {
  requireNode(wf, name);
  return {
    workflow: {
      ...wf,
      nodes: wf.nodes.filter((n) => n.name !== name),
      connections: removeNodeConnections(wf.connections, name),
      pinData: Object.fromEntries(Object.entries(wf.pinData ?? {}).filter(([key]) => key !== name)),
    },
    result: { deleted: name },
  };
}

export function moveNode(
  wf: IWorkflow,
  name: string,
  position: { x: number; y: number },
): MutationResult<{ name: string }> {
  requireNode(wf, name);
  return {
    workflow: {
      ...wf,
      nodes: wf.nodes.map((n) =>
        n.name === name
          ? {
              ...n,
              position: [Math.round(position.x), Math.round(position.y)] as [number, number],
            }
          : n,
      ),
    },
    result: { name },
  };
}

export function renameNode(
  wf: IWorkflow,
  from: string,
  to: string,
): MutationResult<{ from: string; to: string }> {
  requireNode(wf, from);
  const trimmed = to.trim();
  if (!trimmed) throw new Error("New name must be non-empty");
  if (trimmed === from) return { workflow: wf, result: { from, to: from } };
  const existing = wf.nodes.map((n) => n.name).filter((n) => n !== from);
  const finalName = uniqueNodeName(existing, trimmed);
  return {
    workflow: {
      ...wf,
      nodes: wf.nodes.map((n) => (n.name === from ? { ...n, name: finalName } : n)),
      connections: renameInConnections(wf.connections, from, finalName),
      pinData: (() => {
        const pin = { ...(wf.pinData ?? {}) };
        if (pin[from] !== undefined) {
          pin[finalName] = pin[from];
          delete pin[from];
        }
        return pin;
      })(),
    },
    result: { from, to: finalName },
  };
}

export function updateParameters(
  wf: IWorkflow,
  name: string,
  parameters: Record<string, unknown>,
  merge = true,
): MutationResult<{ name: string }> {
  requireNode(wf, name);
  return {
    workflow: {
      ...wf,
      nodes: wf.nodes.map((n) => {
        if (n.name !== name) return n;
        return {
          ...n,
          parameters: merge ? { ...n.parameters, ...parameters } : parameters,
        };
      }),
    },
    result: { name },
  };
}

export function updateCredentials(
  wf: IWorkflow,
  name: string,
  credentials: Record<string, INodeCredentialRef> | null,
): MutationResult<{ name: string }> {
  requireNode(wf, name);
  return {
    workflow: {
      ...wf,
      nodes: wf.nodes.map((n) => {
        if (n.name !== name) return n;
        if (credentials == null || Object.keys(credentials).length === 0) {
          const { credentials: _drop, ...rest } = n;
          return rest as INode;
        }
        return { ...n, credentials: { ...(n.credentials ?? {}), ...credentials } };
      }),
    },
    result: { name },
  };
}

export function setNodeNotes(
  wf: IWorkflow,
  name: string,
  notes: string,
): MutationResult<{ name: string }> {
  requireNode(wf, name);
  return {
    workflow: {
      ...wf,
      nodes: wf.nodes.map((n) => (n.name === name ? { ...n, notes } : n)),
    },
    result: { name },
  };
}

export function setNodeDisabled(
  wf: IWorkflow,
  name: string,
  disabled: boolean,
): MutationResult<{ name: string; disabled: boolean }> {
  requireNode(wf, name);
  return {
    workflow: {
      ...wf,
      nodes: wf.nodes.map((n) => (n.name === name ? { ...n, disabled } : n)),
    },
    result: { name, disabled },
  };
}

export function setPinData(
  wf: IWorkflow,
  name: string,
  items: INodeExecutionData[] | null,
): MutationResult<{ name: string }> {
  requireNode(wf, name);
  const pinData = { ...(wf.pinData ?? {}) };
  if (items === null) delete pinData[name];
  else pinData[name] = items;
  return { workflow: { ...wf, pinData }, result: { name } };
}

/** When wiring a parser into ai_outputParser, enable hasOutputParser on the target. */
function withOutputParserEnabled(
  wf: IWorkflow,
  target: string,
  targetHandle?: string | null,
): IWorkflow {
  const [channel] = (() => {
    const h = targetHandle ?? "main-0";
    const idx = h.lastIndexOf("-");
    return idx === -1 ? [h] : [h.slice(0, idx)];
  })();
  if (channel !== "ai_outputParser") return wf;
  const node = wf.nodes.find((n) => n.name === target);
  if (!node || node.parameters?.hasOutputParser === true) return wf;
  return {
    ...wf,
    nodes: wf.nodes.map((n) =>
      n.name === target
        ? { ...n, parameters: { ...n.parameters, hasOutputParser: true } }
        : n,
    ),
  };
}

export function connectNodes(
  wf: IWorkflow,
  source: string,
  target: string,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): MutationResult<{ source: string; target: string }> {
  requireNode(wf, source);
  requireNode(wf, target);
  const connected: IWorkflow = {
    ...wf,
    connections: addConnection(
      wf.connections,
      source,
      sourceHandle ?? "main-0",
      target,
      targetHandle ?? "main-0",
    ),
  };
  return {
    workflow: withOutputParserEnabled(connected, target, targetHandle),
    result: { source, target },
  };
}

export function disconnectByEdgeId(
  wf: IWorkflow,
  edgeId: string,
): MutationResult<{ edgeId: string }> {
  return {
    workflow: { ...wf, connections: removeConnectionById(wf.connections, edgeId) },
    result: { edgeId },
  };
}

export function summarizeWorkflow(wf: IWorkflow) {
  return {
    id: wf.id,
    name: wf.name,
    active: wf.active,
    nodeCount: wf.nodes.length,
    nodes: wf.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      typeVersion: n.typeVersion,
      position: n.position,
      disabled: n.disabled ?? false,
      parameters: n.parameters,
      credentials: n.credentials
        ? Object.fromEntries(
            Object.entries(n.credentials).map(([k, v]) => [k, { id: v.id ?? null, name: v.name }]),
          )
        : undefined,
      notes: n.notes,
    })),
    connections: wf.connections,
    settings: wf.settings,
  };
}

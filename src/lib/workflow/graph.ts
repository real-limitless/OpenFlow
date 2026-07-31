import type { Edge, Node as FlowNode } from "@xyflow/react";
import type { IConnections, INode, IWorkflow } from "./types";
import { getNodeType, STICKY_NOTE_TYPE } from "../nodes/registry";
import { resolveInputs, resolveOutputs } from "../nodes/types";

export interface OpenFlowNodeData extends Record<string, unknown> {
  node: INode;
}

export type OpenFlowNode = FlowNode<OpenFlowNodeData>;

export const edgeId = (
  source: string,
  channel: string,
  outputIndex: number,
  target: string,
  inputIndex: number,
) => `${source}::${channel}::${outputIndex}->${target}::${inputIndex}`;

/** Workflow model → React Flow nodes (a derived view, never a source of truth). */
export function toFlowNodes(workflow: IWorkflow, selectedName?: string | null): OpenFlowNode[] {
  return workflow.nodes.map((node) => ({
    id: node.name,
    type: node.type === STICKY_NOTE_TYPE ? "sticky" : "openflow",
    position: { x: node.position[0], y: node.position[1] },
    data: { node },
    selected: selectedName === node.name,
    draggable: true,
    zIndex: node.type === STICKY_NOTE_TYPE ? 0 : 1,
  }));
}

/** Workflow model → React Flow edges. */
export function toFlowEdges(workflow: IWorkflow): Edge[] {
  const edges: Edge[] = [];
  const known = new Set(workflow.nodes.map((n) => n.name));

  for (const [sourceName, channels] of Object.entries(workflow.connections ?? {})) {
    if (!known.has(sourceName)) continue;
    for (const [channel, outputs] of Object.entries(channels)) {
      outputs?.forEach((targets, outputIndex) => {
        targets?.forEach((t) => {
          if (!t || !known.has(t.node)) return;
          edges.push({
            id: edgeId(sourceName, channel, outputIndex, t.node, t.index ?? 0),
            source: sourceName,
            target: t.node,
            sourceHandle: `${channel}-${outputIndex}`,
            targetHandle: `${t.type ?? "main"}-${t.index ?? 0}`,
            type: "openflow",
            data: { channel },
          });
        });
      });
    }
  }
  return edges;
}

function parseHandle(handle: string | null | undefined, fallback = "main"): [string, number] {
  if (!handle) return [fallback, 0];
  const idx = handle.lastIndexOf("-");
  if (idx === -1) return [handle, 0];
  return [handle.slice(0, idx), Number(handle.slice(idx + 1)) || 0];
}

export function addConnection(
  connections: IConnections,
  source: string,
  sourceHandle: string | null | undefined,
  target: string,
  targetHandle: string | null | undefined,
): IConnections {
  const [channel, outputIndex] = parseHandle(sourceHandle);
  const [targetChannel, inputIndex] = parseHandle(targetHandle);
  const next: IConnections = structuredClone(connections ?? {});
  next[source] ??= {};
  next[source][channel] ??= [];
  while (next[source][channel].length <= outputIndex) next[source][channel].push([]);
  const list = (next[source][channel][outputIndex] ??= []);
  if (!list.some((t) => t.node === target && t.index === inputIndex && t.type === targetChannel)) {
    list.push({ node: target, type: targetChannel, index: inputIndex });
  }
  return next;
}

export function removeConnectionById(connections: IConnections, id: string): IConnections {
  const next: IConnections = structuredClone(connections ?? {});
  for (const [sourceName, channels] of Object.entries(next)) {
    for (const [channel, outputs] of Object.entries(channels)) {
      outputs.forEach((targets, outputIndex) => {
        if (!targets) return;
        channels[channel][outputIndex] = targets.filter(
          (t) => edgeId(sourceName, channel, outputIndex, t.node, t.index ?? 0) !== id,
        );
      });
    }
  }
  return next;
}

export function removeNodeConnections(connections: IConnections, nodeName: string): IConnections {
  const next: IConnections = structuredClone(connections ?? {});
  delete next[nodeName];
  for (const channels of Object.values(next)) {
    for (const outputs of Object.values(channels)) {
      outputs.forEach((targets, i) => {
        if (targets) outputs[i] = targets.filter((t) => t.node !== nodeName);
      });
    }
  }
  return next;
}

export function renameInConnections(
  connections: IConnections,
  from: string,
  to: string,
): IConnections {
  const next: IConnections = structuredClone(connections ?? {});
  if (next[from]) {
    next[to] = next[from];
    delete next[from];
  }
  for (const channels of Object.values(next)) {
    for (const outputs of Object.values(channels)) {
      outputs.forEach((targets) => {
        targets?.forEach((t) => {
          if (t.node === from) t.node = to;
        });
      });
    }
  }
  return next;
}

export function uniqueNodeName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  let i = 1;
  while (existing.includes(`${base}${i}`)) i += 1;
  return `${base}${i}`;
}

export function handlesFor(node: INode) {
  const description = getNodeType(node.type);
  return {
    description,
    inputs: resolveInputs(description, node.parameters ?? {}),
    outputs: resolveOutputs(description, node.parameters ?? {}),
  };
}

/** Per-channel ordinal handle ids matching n8n connection index (not flat array index). */
export function channelHandleIds(channels: string[]): string[] {
  const counts = new Map<string, number>();
  return channels.map((channel) => {
    const n = counts.get(channel) ?? 0;
    counts.set(channel, n + 1);
    return `${channel}-${n}`;
  });
}

export interface MigrationRow {
  name: string;
  type: string;
  status: "supported" | "placeholder";
  displayName: string;
}

export function migrationReport(workflow: IWorkflow): MigrationRow[] {
  return workflow.nodes.map((node) => {
    const d = getNodeType(node.type);
    return {
      name: node.name,
      type: node.type,
      status: d.placeholder ? "placeholder" : "supported",
      displayName: d.displayName,
    };
  });
}

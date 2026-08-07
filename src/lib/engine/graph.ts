import type { IConnections, INode, IWorkflow } from "../workflow/types";
import { getNodeType } from "../nodes/registry";
import { toCanonicalType, typesEqual } from "../nodes/type-ids";

/** Known trigger type strings (fallback when description lookup is thin). */
const TRIGGER_TYPES = new Set(
  [
    "n8n-nodes-base.manualTrigger",
    "n8n-nodes-base.manualWorkflowTrigger",
    "n8n-nodes-base.start",
    "n8n-nodes-base.webhook",
    "n8n-nodes-base.scheduleTrigger",
    "n8n-nodes-base.executeWorkflowTrigger",
    "n8n-nodes-base.errorTrigger",
    "n8n-nodes-base.formTrigger",
    "n8n-nodes-base.sseTrigger",
    "n8n-nodes-base.localFileTrigger",
    "n8n-nodes-base.workflowTrigger",
    "n8n-nodes-base.activationTrigger",
    "n8n-nodes-base.n8nTrigger",
    "@n8n/n8n-nodes-langchain.chatTrigger",
    "@n8n/n8n-nodes-langchain.mcpTrigger",
  ].map(toCanonicalType),
);

export function isTriggerNode(node: INode): boolean {
  if (node.disabled) return false;
  if (TRIGGER_TYPES.has(toCanonicalType(node.type))) return true;
  try {
    const desc = getNodeType(node.type);
    if (desc.group?.includes("trigger")) return true;
    if (desc.category === "Triggers") return true;
    // Trigger-like: no inputs, at least one output
    if ((desc.inputs?.length ?? 0) === 0 && (desc.outputs?.length ?? 0) > 0) {
      if (desc.placeholder) return false;
      // Sticky / inspect canvas nodes have no outputs either — skip empty outputs
      if ((desc.outputs?.length ?? 0) === 0) return false;
      // Prefer explicit group; empty-input action nodes still aren't triggers
      return desc.group?.includes("trigger") === true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Enabled trigger nodes on the canvas (for Execute menu). */
export function listTriggerNodes(workflow: IWorkflow): INode[] {
  return workflow.nodes.filter((n) => isTriggerNode(n));
}

export function buildAdjacency(connections: IConnections): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const [sourceName, channels] of Object.entries(connections)) {
    for (const outputs of Object.values(channels)) {
      for (const targets of outputs) {
        if (!targets) continue;
        for (const t of targets) {
          if (!t) continue;
          const list = adj.get(sourceName);
          if (list) {
            if (!list.includes(t.node)) list.push(t.node);
          } else {
            adj.set(sourceName, [t.node]);
          }
        }
      }
    }
  }
  return adj;
}

export interface IncomingEdge {
  source: string;
  sourceOutput: number;
  targetInput: number;
  /** Target input channel (e.g. main, ai_tool). */
  channel: string;
}

export function buildIncoming(connections: IConnections): Map<string, IncomingEdge[]> {
  const incoming = new Map<string, IncomingEdge[]>();
  for (const [sourceName, channels] of Object.entries(connections)) {
    for (const [sourceChannel, outputs] of Object.entries(channels)) {
      outputs.forEach((targets, sourceOutput) => {
        if (!targets) return;
        for (const t of targets) {
          if (!t) continue;
          const list = incoming.get(t.node) ?? [];
          list.push({
            source: sourceName,
            sourceOutput,
            targetInput: t.index ?? 0,
            channel: t.type ?? sourceChannel ?? "main",
          });
          incoming.set(t.node, list);
        }
      });
    }
  }
  return incoming;
}

/**
 * Resolve which node(s) start a run.
 * @param preferredStart optional single trigger/node name from the editor
 */
export function resolveStartNodes(workflow: IWorkflow, preferredStart?: string | null): string[] {
  const known = new Set(workflow.nodes.map((n) => n.name));
  if (preferredStart && known.has(preferredStart)) {
    const node = workflow.nodes.find((n) => n.name === preferredStart);
    if (node && !node.disabled) return [preferredStart];
  }

  const triggers = listTriggerNodes(workflow);
  if (triggers.length > 0) {
    // Prefer Manual Trigger when several exist and none was chosen
    const manual = triggers.find(
      (n) =>
        typesEqual(n.type, "n8n-nodes-base.manualTrigger") ||
        typesEqual(n.type, "n8n-nodes-base.manualWorkflowTrigger") ||
        typesEqual(n.type, "n8n-nodes-base.start"),
    );
    return [manual?.name ?? triggers[0]!.name];
  }

  if (workflow.nodes.length > 0) {
    const first = workflow.nodes.find((n) => !n.disabled);
    if (first) return [first.name];
  }
  return [];
}

/** All node names reachable from `starts` following outgoing edges (including starts). */
export function nodesReachableFrom(
  adjacency: Map<string, string[]>,
  starts: string[],
): Set<string> {
  const visited = new Set<string>();
  const queue = [...starts];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (visited.has(n)) continue;
    visited.add(n);
    for (const t of adjacency.get(n) ?? []) {
      if (!visited.has(t)) queue.push(t);
    }
  }
  return visited;
}

/**
 * All ancestors of `target` via main (and other) incoming edges, optionally
 * including the target itself.
 */
export function nodesLeadingTo(
  incoming: Map<string, IncomingEdge[]>,
  target: string,
  opts?: { includeTarget?: boolean },
): Set<string> {
  const visited = new Set<string>();
  const queue = [target];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (visited.has(n)) continue;
    visited.add(n);
    for (const edge of incoming.get(n) ?? []) {
      if (!visited.has(edge.source)) queue.push(edge.source);
    }
  }
  if (opts?.includeTarget === false) {
    visited.delete(target);
  }
  return visited;
}

/**
 * Grow `reachable` to include the sub-nodes the reachable nodes depend on.
 *
 * Sub-nodes (a chat model, a tool, a memory) attach to their parent over a
 * non-`main` channel and point *into* it, so a forward walk from the trigger
 * never lands on them — an agent would run with no model attached. They are
 * dependencies, not downstream steps, so pull them in from the other end.
 *
 * Transitive on purpose: a tool may have its own model hanging off it.
 */
export function addSubNodeDependencies(
  incoming: Map<string, IncomingEdge[]>,
  reachable: Set<string>,
): Set<string> {
  const queue = [...reachable];
  while (queue.length > 0) {
    const n = queue.shift()!;
    for (const edge of incoming.get(n) ?? []) {
      if (edge.channel === "main" || reachable.has(edge.source)) continue;
      reachable.add(edge.source);
      queue.push(edge.source);
    }
  }
  return reachable;
}

/** Restrict adjacency to a set of nodes (edges only when both ends are in the set). */
export function filterAdjacency(
  adjacency: Map<string, string[]>,
  keep: Set<string>,
): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const name of keep) {
    const outs = (adjacency.get(name) ?? []).filter((t) => keep.has(t));
    next.set(name, outs);
  }
  return next;
}

export function topologicalSort(adjacency: Map<string, string[]>): string[] {
  const allNodes = new Set<string>();
  for (const [src, targets] of adjacency) {
    allNodes.add(src);
    for (const t of targets) allNodes.add(t);
  }

  const inDegree = new Map<string, number>();
  for (const n of allNodes) inDegree.set(n, 0);
  for (const targets of adjacency.values()) {
    for (const t of targets) {
      inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [n, deg] of inDegree) {
    if (deg === 0) queue.push(n);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    for (const t of adjacency.get(node) ?? []) {
      const deg = (inDegree.get(t) ?? 1) - 1;
      inDegree.set(t, deg);
      if (deg === 0) queue.push(t);
    }
  }

  // Nodes with cycles or missing edges: append remaining in stable order
  for (const n of allNodes) {
    if (!result.includes(n)) result.push(n);
  }

  return result;
}

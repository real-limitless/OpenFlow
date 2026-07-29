import type { IConnections, IWorkflow } from "../workflow/types";

const TRIGGER_TYPES = new Set([
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.webhook",
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.executeWorkflowTrigger",
  "n8n-nodes-base.errorTrigger",
]);

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
}

export function buildIncoming(connections: IConnections): Map<string, IncomingEdge[]> {
  const incoming = new Map<string, IncomingEdge[]>();
  for (const [sourceName, channels] of Object.entries(connections)) {
    for (const outputs of Object.values(channels)) {
      outputs.forEach((targets, sourceOutput) => {
        if (!targets) return;
        for (const t of targets) {
          if (!t) continue;
          const list = incoming.get(t.node) ?? [];
          list.push({ source: sourceName, sourceOutput, targetInput: t.index ?? 0 });
          incoming.set(t.node, list);
        }
      });
    }
  }
  return incoming;
}

export function resolveStartNodes(workflow: IWorkflow): string[] {
  const triggers = workflow.nodes.filter(
    (n) => TRIGGER_TYPES.has(n.type) && !n.disabled,
  );
  if (triggers.length > 0) return triggers.map((n) => n.name);
  if (workflow.nodes.length > 0) return [workflow.nodes[0].name];
  return [];
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

  return result;
}

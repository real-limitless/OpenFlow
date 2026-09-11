import type { IWorkflow } from "./types";

export type WorkflowVersionDiff = {
  nameChanged: boolean;
  fromName: string;
  toName: string;
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesChanged: string[];
  fromNodeCount: number;
  toNodeCount: number;
};

function nodeMap(wf: IWorkflow): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of wf.nodes ?? []) {
    map.set(node.id, `${node.type}:${node.name}:${JSON.stringify(node.parameters ?? {})}`);
  }
  return map;
}

export function diffWorkflows(from: IWorkflow, to: IWorkflow): WorkflowVersionDiff {
  const a = nodeMap(from);
  const b = nodeMap(to);
  const nodesAdded: string[] = [];
  const nodesRemoved: string[] = [];
  const nodesChanged: string[] = [];
  for (const id of b.keys()) {
    if (!a.has(id)) nodesAdded.push(id);
    else if (a.get(id) !== b.get(id)) nodesChanged.push(id);
  }
  for (const id of a.keys()) {
    if (!b.has(id)) nodesRemoved.push(id);
  }
  return {
    nameChanged: from.name !== to.name,
    fromName: from.name,
    toName: to.name,
    nodesAdded,
    nodesRemoved,
    nodesChanged,
    fromNodeCount: from.nodes?.length ?? 0,
    toNodeCount: to.nodes?.length ?? 0,
  };
}

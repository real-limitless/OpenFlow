import dagre from "dagre";
import type { IWorkflow } from "@/lib/workflow/types";

const NODE_W = 228;
const NODE_H = 66;

/** Left-to-right auto layout over the workflow's connection graph. */
export function autoLayout(workflow: IWorkflow): IWorkflow {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 48, ranksep: 110, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of workflow.nodes) {
    g.setNode(node.name, { width: NODE_W, height: NODE_H });
  }
  for (const [source, channels] of Object.entries(workflow.connections ?? {})) {
    for (const outputs of Object.values(channels)) {
      for (const targets of outputs) {
        for (const t of targets ?? []) {
          if (g.hasNode(source) && g.hasNode(t.node)) g.setEdge(source, t.node);
        }
      }
    }
  }

  dagre.layout(g);

  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => {
      const pos = g.node(node.name);
      if (!pos) return node;
      return {
        ...node,
        position: [Math.round(pos.x - NODE_W / 2), Math.round(pos.y - NODE_H / 2)] as [number, number],
      };
    }),
  };
}

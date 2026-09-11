import type { IWorkflow } from "./types";
import {
  nodeDepth,
  scoreNodeTypes,
  type DepthScore,
  type NodeDepth,
} from "../nodes/depth";

export type ImportCompatRow = {
  name: string;
  type: string;
  depth: NodeDepth;
};

export type ImportCompatReport = DepthScore & {
  rows: ImportCompatRow[];
};

/** Per-node depth plus overall score for an imported workflow JSON. */
export function importCompatReport(workflow: IWorkflow): ImportCompatReport {
  const scored = scoreNodeTypes(workflow.nodes.map((n) => n.type));
  return {
    ...scored,
    rows: workflow.nodes.map((n) => ({
      name: n.name,
      type: n.type,
      depth: nodeDepth(n.type),
    })),
  };
}

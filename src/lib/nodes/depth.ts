/**
 * Honest node depth for palette, templates, and import.
 *
 * Drive badges from executor truth (the builtin manifest + unavailability tags),
 * not catalog.json counts or scraped `readyToDemo` flags. A registered
 * definition with no executor is partial. An unknown type is a stub.
 */
import {
  getDescription,
  getExecutorUnavailability,
  hasBuiltinExecutor,
} from "../engine/node-runtime";

export type NodeDepth = "ready" | "partial" | "stub";

const CANVAS_ONLY_TYPES = new Set([
  "n8n-nodes-base.stickyNote",
  "stickyNote",
  "openflow-node-base.stickyNote",
  "openflow.inspectTable",
  "openflow.inspectMedia",
]);

export const DEPTH_LABEL: Record<NodeDepth, string> = {
  ready: "Ready",
  partial: "Partial",
  stub: "Stub",
};

export function isCanvasOnlyType(type: string): boolean {
  if (CANVAS_ONLY_TYPES.has(type)) return true;
  const short = type.split(".").pop() ?? type;
  if (short === "stickyNote") return true;
  if (type.includes("inspectTable") || type.includes("inspectMedia")) return true;
  const desc = getDescription(type);
  if (!desc) return false;
  return (desc.inputs ?? []).length === 0 && (desc.outputs ?? []).length === 0;
}

/**
 * Classify a node type for UI badges.
 *
 * Order matters: unavailable executors still `hasBuiltinExecutor`, but they
 * throw on first use, so they must not read as ready.
 */
export function nodeDepth(type: string): NodeDepth {
  if (isCanvasOnlyType(type)) return "ready";
  if (getExecutorUnavailability(type)) return "partial";
  if (hasBuiltinExecutor(type)) return "ready";
  const desc = getDescription(type);
  if (desc && desc.placeholder !== true) return "partial";
  return "stub";
}

export type DepthScore = {
  ready: string[];
  partial: string[];
  stub: string[];
  total: number;
  /** 0–100, ready / scored (canvas-only types are skipped). */
  score: number;
  label: NodeDepth;
};

export function scoreNodeTypes(types: string[]): DepthScore {
  const unique = [...new Set(types.filter(Boolean))];
  const ready: string[] = [];
  const partial: string[] = [];
  const stub: string[] = [];
  for (const t of unique) {
    if (isCanvasOnlyType(t)) continue;
    const depth = nodeDepth(t);
    if (depth === "ready") ready.push(t);
    else if (depth === "partial") partial.push(t);
    else stub.push(t);
  }
  const total = ready.length + partial.length + stub.length;
  const score = total === 0 ? 100 : Math.round((ready.length / total) * 100);
  let label: NodeDepth;
  if (total === 0 || (partial.length === 0 && stub.length === 0)) label = "ready";
  else if (ready.length === 0 && partial.length === 0) label = "stub";
  else label = "partial";
  return { ready, partial, stub, total, score, label };
}

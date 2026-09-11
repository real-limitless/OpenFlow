/**
 * Score scraped template node types against the OpenFlow registry.
 * Canvas-only types (sticky notes) are ignored for scoring.
 *
 * Honesty: only a working builtin executor counts as ready. A definition
 * without an executor is partial; an unknown type is a stub (API: limited).
 */
import { nodeDepth, scoreNodeTypes } from "../../lib/nodes/depth";

export type CompatLevel = "ready" | "partial" | "limited";

export type CompatReport = {
  level: CompatLevel;
  supported: string[];
  missing: string[];
  partial: string[];
  stub: string[];
  /** Fraction of scored types that OpenFlow can run (0–1). */
  ratio: number;
  total: number;
};

export function isNodeTypeSupported(type: string): boolean {
  return nodeDepth(type) === "ready";
}

export function scoreTemplateCompatibility(nodeTypes: string[]): CompatReport {
  const scored = scoreNodeTypes(nodeTypes);
  const level: CompatLevel = scored.label === "stub" ? "limited" : scored.label;
  return {
    level,
    supported: scored.ready,
    missing: [...scored.partial, ...scored.stub],
    partial: scored.partial,
    stub: scored.stub,
    ratio: scored.score / 100,
    total: scored.total,
  };
}

export function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

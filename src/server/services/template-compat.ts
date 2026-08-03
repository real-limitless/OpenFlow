/**
 * Score scraped template node types against the OpenFlow registry.
 * Canvas-only types (sticky notes) are ignored for scoring.
 */
import {
  getDescription,
  hasBuiltinExecutor,
  hasExecutor,
} from "../../lib/engine/node-runtime";

const IGNORE_TYPES = new Set([
  "n8n-nodes-base.stickyNote",
  "stickyNote",
]);

export type CompatLevel = "ready" | "partial" | "limited";

export type CompatReport = {
  level: CompatLevel;
  supported: string[];
  missing: string[];
  /** Fraction of scored types that OpenFlow can run (0–1). */
  ratio: number;
  total: number;
};

export function isNodeTypeSupported(type: string): boolean {
  if (IGNORE_TYPES.has(type)) return true;
  if (hasBuiltinExecutor(type) || hasExecutor(type)) return true;
  // Description-only (ui-only) still counts as "known" for palette display
  if (getDescription(type)) return true;
  return false;
}

export function scoreTemplateCompatibility(nodeTypes: string[]): CompatReport {
  const unique = [...new Set(nodeTypes.filter(Boolean))];
  const scored = unique.filter((t) => !IGNORE_TYPES.has(t));
  const supported: string[] = [];
  const missing: string[] = [];
  for (const t of scored) {
    if (isNodeTypeSupported(t)) supported.push(t);
    else missing.push(t);
  }
  const total = scored.length;
  const ratio = total === 0 ? 1 : supported.length / total;
  let level: CompatLevel;
  if (total === 0 || missing.length === 0) level = "ready";
  else if (supported.length === 0) level = "limited";
  else if (ratio >= 0.5) level = "partial";
  else level = "limited";
  return { level, supported, missing, ratio, total };
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

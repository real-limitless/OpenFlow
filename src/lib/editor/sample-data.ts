import type { ExecutionRunData } from "@/lib/engine/types";
import type { IConnections, INodeExecutionData } from "@/lib/workflow/types";
import { buildIncoming } from "@/lib/engine/graph";

export type SampleItem = { json: Record<string, unknown> };

export function itemsFromRunNode(
  runData: ExecutionRunData | null | undefined,
  nodeName: string,
  sourceOutput?: number,
): SampleItem[] | undefined {
  if (!runData?.[nodeName]) return undefined;
  const entry = runData[nodeName];
  if (entry.status !== "success" || !entry.items?.length) return undefined;

  let branch: INodeExecutionData[] | undefined;
  if (sourceOutput != null && entry.items[sourceOutput]) {
    branch = entry.items[sourceOutput] ?? undefined;
  } else {
    branch = entry.items.flat().filter(Boolean) as INodeExecutionData[];
  }
  if (!branch?.length) return undefined;
  return branch.map((it) => ({ json: (it.json ?? {}) as Record<string, unknown> }));
}

/** pinData wins over runData for the same node name (user override). */
export function mergeNodeSampleData(
  pinData: Record<string, INodeExecutionData[]> | undefined,
  runData: ExecutionRunData | null | undefined,
): Record<string, SampleItem[]> {
  const out: Record<string, SampleItem[]> = {};
  if (runData) {
    for (const name of Object.keys(runData)) {
      const items = itemsFromRunNode(runData, name);
      if (items?.length) out[name] = items;
    }
  }
  for (const [k, v] of Object.entries(pinData ?? {})) {
    if (v?.length) {
      out[k] = v.map((it) => ({ json: (it.json ?? {}) as Record<string, unknown> }));
    }
  }
  return out;
}

/**
 * Resolve main-input items for a node from pinData/runData of upstream sources.
 * Prefers main-channel edges (same contract as the runner).
 */
export function resolveIncomingItems(
  connections: IConnections | undefined,
  nodeName: string,
  nodeData: Record<string, SampleItem[]>,
  runData?: ExecutionRunData | null,
): SampleItem[] {
  const incoming = buildIncoming(connections ?? {});
  const edges = (incoming.get(nodeName) ?? []).filter((e) => e.channel === "main");

  // Prefer target input 0, then other main inputs in order
  const ordered = [...edges].sort((a, b) => a.targetInput - b.targetInput);

  const collected: SampleItem[] = [];
  for (const e of ordered) {
    // Prefer full pin/run sample for source when available
    if (nodeData[e.source]?.length) {
      // pinData is flat (no output branches); use all
      if (e.sourceOutput === 0 || !runData?.[e.source]?.items?.[e.sourceOutput]) {
        collected.push(...nodeData[e.source]!);
        continue;
      }
    }
    const fromRun = itemsFromRunNode(runData, e.source, e.sourceOutput);
    if (fromRun?.length) {
      collected.push(...fromRun);
      continue;
    }
    if (nodeData[e.source]?.length) {
      collected.push(...nodeData[e.source]!);
    }
  }

  return collected;
}

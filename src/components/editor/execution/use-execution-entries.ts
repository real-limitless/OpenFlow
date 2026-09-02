import { useMemo } from "react";
import type { ExecutionRunData } from "@/lib/engine/types";
import type { ExecutionEntry, ExecutionStatus } from "./types";

function itemCount(items: ExecutionRunData[string]["items"]): number {
  return items?.reduce((sum, branch) => sum + (branch?.length ?? 0), 0) ?? 0;
}

function durationMs(
  startedAt?: string,
  finishedAt?: string,
  status?: ExecutionStatus,
): number | undefined {
  if (!startedAt) return undefined;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return undefined;
  if (finishedAt) {
    const end = Date.parse(finishedAt);
    if (Number.isFinite(end)) return Math.max(0, end - start);
  }
  if (status === "running") {
    return Math.max(0, Date.now() - start);
  }
  return undefined;
}

export function buildExecutionEntries(
  runData: ExecutionRunData | null | undefined,
  nodeOrder?: string[],
): ExecutionEntry[] {
  if (!runData) return [];
  const names = Object.keys(runData);
  const orderIndex = new Map<string, number>();
  if (nodeOrder?.length) {
    nodeOrder.forEach((n, i) => orderIndex.set(n, i));
  }
  names.forEach((n, i) => {
    if (!orderIndex.has(n)) orderIndex.set(n, 10_000 + i);
  });

  const entries = names.map((name) => {
    const data = runData[name]!;
    return {
      name,
      status: data.status,
      itemCount: itemCount(data.items),
      error: data.error,
      startedAt: data.startedAt,
      finishedAt: data.finishedAt,
      durationMs: durationMs(data.startedAt, data.finishedAt, data.status),
      items: data.items,
      progress: data.progress,
      trace: data.trace,
    } satisfies ExecutionEntry;
  });

  entries.sort((a, b) => {
    const aStart = a.startedAt ? Date.parse(a.startedAt) : NaN;
    const bStart = b.startedAt ? Date.parse(b.startedAt) : NaN;
    const aOk = Number.isFinite(aStart);
    const bOk = Number.isFinite(bStart);
    if (aOk && bOk && aStart !== bStart) return aStart - bStart;
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    return (orderIndex.get(a.name) ?? 0) - (orderIndex.get(b.name) ?? 0);
  });

  return entries;
}

export function useExecutionEntries(
  runData: ExecutionRunData | null | undefined,
  nodeOrder?: string[],
) {
  return useMemo(() => buildExecutionEntries(runData, nodeOrder), [runData, nodeOrder]);
}

export function executionStats(entries: ExecutionEntry[]) {
  const counts: Record<ExecutionStatus, number> = {
    pending: 0,
    running: 0,
    success: 0,
    error: 0,
    skipped: 0,
  };
  for (const e of entries) counts[e.status] += 1;
  return counts;
}

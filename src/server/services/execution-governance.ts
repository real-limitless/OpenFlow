import { prisma } from "../db";
import { executionQueue } from "../queue";
import {
  parseExecutionTimeoutMs,
  parseMaxConcurrency,
  type AbortReason,
} from "../../lib/engine/governance";
import type { IWorkflowSettings } from "../../lib/workflow/types";
import { serializeRunData } from "./retention";

const ACTIVE = ["running", "waiting"] as const;

export function settingsRecord(
  settings: IWorkflowSettings | Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return (settings ?? {}) as Record<string, unknown>;
}

export async function countActiveExecutions(workflowId: string, exceptId?: string): Promise<number> {
  return prisma.execution.count({
    where: {
      workflowId,
      status: { in: [...ACTIVE] },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
}

export async function assertWorkflowConcurrency(
  workflowId: string,
  settings: IWorkflowSettings | Record<string, unknown> | null | undefined,
  exceptId?: string,
): Promise<{ ok: true } | { ok: false; status: 429; error: string; retryAfterSec: number }> {
  const max = parseMaxConcurrency(settingsRecord(settings));
  if (max == null) return { ok: true };
  const active = await countActiveExecutions(workflowId, exceptId);
  if (active < max) return { ok: true };
  return {
    ok: false,
    status: 429,
    error: `Workflow concurrency limit reached (${max})`,
    retryAfterSec: 5,
  };
}

export async function requestExecutionCancel(executionId: string): Promise<boolean> {
  const row = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!row) return false;
  if (!ACTIVE.includes(row.status as (typeof ACTIVE)[number])) return false;
  await prisma.execution.update({
    where: { id: executionId },
    data: {
      status: "cancelled",
      finishedAt: new Date(),
      error: JSON.stringify({ message: "Execution cancelled" }),
    },
  });
  return true;
}

export async function abortReasonFor(executionId: string): Promise<AbortReason | null> {
  const row = await prisma.execution.findUnique({
    where: { id: executionId },
    select: { status: true, error: true, meta: true },
  });
  if (!row) return "cancelled";
  if (row.status === "cancelled") return "cancelled";
  if (row.status === "error") {
    try {
      const parsed = row.error ? (JSON.parse(row.error) as { code?: string; message?: string }) : {};
      if (parsed.code === "timeout" || parsed.message?.toLowerCase().includes("timed out")) {
        return "timeout";
      }
    } catch {
      /* ignore */
    }
  }
  const timeoutAt = timeoutAtFromMeta(row.meta);
  if (timeoutAt && Date.now() >= timeoutAt) return "timeout";
  return null;
}

function timeoutAtFromMeta(meta: string | null): number | null {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta) as { timeoutAt?: string };
    if (typeof parsed.timeoutAt === "string") {
      const t = Date.parse(parsed.timeoutAt);
      return Number.isFinite(t) ? t : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function markExecutionTimeout(executionId: string): Promise<void> {
  const row = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!row || !ACTIVE.includes(row.status as (typeof ACTIVE)[number])) return;
  await prisma.execution.update({
    where: { id: executionId },
    data: {
      status: "error",
      finishedAt: new Date(),
      error: JSON.stringify({ code: "timeout", message: "Execution timed out" }),
    },
  });
}

export async function stampTimeoutDeadline(
  executionId: string,
  settings: IWorkflowSettings | Record<string, unknown> | null | undefined,
  startedAt = Date.now(),
): Promise<number | null> {
  const row = await prisma.execution.findUnique({ where: { id: executionId }, select: { meta: true } });
  let meta: Record<string, unknown> = {};
  try {
    meta = row?.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : {};
  } catch {
    meta = {};
  }
  const existingAt = timeoutAtFromMeta(row?.meta ?? null);
  if (existingAt) {
    return Math.max(0, existingAt - Date.now());
  }
  const ms = parseExecutionTimeoutMs(settingsRecord(settings));
  if (ms == null) return null;
  meta.timeoutAt = new Date(startedAt + ms).toISOString();
  await prisma.execution.update({
    where: { id: executionId },
    data: { meta: JSON.stringify(meta) },
  });
  return ms;
}

export async function finalizeIfActive(
  executionId: string,
  data: { status: string; runData?: string; error?: string | null },
): Promise<boolean> {
  const row = await prisma.execution.findUnique({ where: { id: executionId }, select: { status: true } });
  if (!row || !ACTIVE.includes(row.status as (typeof ACTIVE)[number])) return false;
  const runData =
    data.runData !== undefined ? await serializeRunData(data.runData) : undefined;
  await prisma.execution.update({
    where: { id: executionId },
    data: {
      status: data.status,
      finishedAt: new Date(),
      ...(runData !== undefined ? { runData } : {}),
      ...(data.error !== undefined ? { error: data.error } : {}),
    },
  });
  return true;
}

/** Drop queued jobs for a cancelled/timed-out execution. Best-effort. */
export async function discardQueuedJobs(executionId: string): Promise<void> {
  try {
    const jobs = await executionQueue.getJobs(["waiting", "delayed", "active", "paused"]);
    await Promise.all(
      jobs
        .filter((job) => job.data?.executionId === executionId)
        .map((job) => job.remove().catch(() => undefined)),
    );
  } catch {
    /* queue may be down */
  }
}

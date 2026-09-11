import { prisma } from "../db";
import { executionQueue } from "../queue";
import type { RunResult } from "../../lib/engine/runner";
import type { INodeExecutionData } from "../../lib/workflow/types";
import { applyHitlDecision, type HitlDecision } from "../../lib/engine/hitl";

export async function persistPausedExecution(opts: {
  executionId: string;
  workflowId: string;
  userId: string;
  projectId: string;
  environmentId?: string;
  result: RunResult;
}): Promise<void> {
  const paused = opts.result.paused;
  if (!paused) return;

  const existing = await prisma.execution.findUnique({
    where: { id: opts.executionId },
    select: { meta: true },
  });
  let meta: Record<string, unknown> = {};
  try {
    meta = existing?.meta ? (JSON.parse(existing.meta) as Record<string, unknown>) : {};
  } catch {
    meta = {};
  }
  meta.wait = {
    nodeName: paused.nodeName,
    resume: paused.resume,
    resumeAt: paused.resumeAt,
  };

  await prisma.execution.update({
    where: { id: opts.executionId },
    data: {
      status: "waiting",
      finishedAt: null,
      runData: JSON.stringify(opts.result.runData),
      meta: JSON.stringify(meta),
    },
  });

  if (paused.resume === "webhook" || paused.resume === "form") {
    return;
  }

  const delay = paused.resumeAt
    ? Math.max(0, new Date(paused.resumeAt).getTime() - Date.now())
    : 0;
  const pinData: Record<string, INodeExecutionData[]> = {
    [paused.nodeName]: paused.items,
  };
  await executionQueue.add(
    "execute",
    {
      workflowId: opts.workflowId,
      executionId: opts.executionId,
      mode: "trigger",
      userId: opts.userId,
      projectId: opts.projectId,
      environmentId: opts.environmentId,
      pinData: pinData as unknown as Record<string, unknown>,
      startNode: paused.nodeName,
    },
    { delay },
  );
}

export async function resumeWaitingExecution(
  executionId: string,
  opts?: { decision?: HitlDecision; comment?: string },
): Promise<boolean> {
  const row = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!row || row.status !== "waiting") return false;
  const { abortReasonFor, markExecutionTimeout } = await import("./execution-governance");
  const reason = await abortReasonFor(executionId);
  if (reason === "timeout") {
    await markExecutionTimeout(executionId);
    return false;
  }
  if (reason === "cancelled") return false;
  let nodeName = "";
  let items: INodeExecutionData[] = [{ json: {} }];
  try {
    const meta = row.meta ? (JSON.parse(row.meta) as { wait?: { nodeName?: string } }) : {};
    nodeName = meta.wait?.nodeName ?? "";
    const runData = JSON.parse(row.runData || "{}") as Record<
      string,
      { items?: INodeExecutionData[][] }
    >;
    items = runData[nodeName]?.items?.[0] ?? items;
  } catch {
    /* ignore */
  }
  if (opts?.decision) {
    items = applyHitlDecision(items, opts.decision, opts.comment);
  }
  const workflow = await prisma.workflow.findUnique({ where: { id: row.workflowId } });
  if (!workflow) return false;

  await prisma.execution.update({
    where: { id: executionId },
    data: { status: "running", finishedAt: null },
  });

  await executionQueue.add("execute", {
    workflowId: row.workflowId,
    executionId,
    mode: row.mode as "manual" | "webhook" | "trigger",
    userId: workflow.userId,
    projectId: workflow.projectId,
    pinData: nodeName ? { [nodeName]: items } : undefined,
    startNode: nodeName || undefined,
  });
  return true;
}

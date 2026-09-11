import { prisma } from "../db";
import { executionQueue } from "../queue";
import type { RunResult } from "../../lib/engine/runner";
import type { INodeExecutionData } from "../../lib/workflow/types";

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

  await prisma.execution.update({
    where: { id: opts.executionId },
    data: {
      status: "waiting",
      finishedAt: null,
      runData: JSON.stringify(opts.result.runData),
      meta: JSON.stringify({
        wait: {
          nodeName: paused.nodeName,
          resume: paused.resume,
          resumeAt: paused.resumeAt,
        },
      }),
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

export async function resumeWaitingExecution(executionId: string): Promise<boolean> {
  const row = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!row || row.status !== "waiting") return false;
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

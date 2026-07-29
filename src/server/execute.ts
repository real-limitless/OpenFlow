import { prisma } from "./db";
import { executionQueue } from "./queue";
import { executeWorkflow } from "../lib/engine/runner";
import { defaultExecutors } from "../lib/engine";
import { resolveCredential } from "./credentials";
import type { IWorkflow, INodeExecutionData } from "../lib/workflow/types";

let redisAvailable: boolean | null = null;

async function checkRedis(): Promise<boolean> {
  if (redisAvailable !== null) return redisAvailable;
  try {
    const { connection } = await import("./queue");
    const pong = await Promise.race([
      connection.ping(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 1000)),
    ]);
    redisAvailable = pong === "PONG";
  } catch {
    redisAvailable = false;
  }
  return redisAvailable;
}

export async function enqueueOrRun(
  workflowId: string,
  executionId: string,
  mode: "manual" | "webhook" | "trigger",
  pinData?: Record<string, INodeExecutionData[]>,
): Promise<void> {
  if (await checkRedis()) {
    await executionQueue.add("execute", { workflowId, executionId, mode, pinData });
    return;
  }

  // Fallback: run in-process
  const row = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!row) {
    await prisma.execution.update({
      where: { id: executionId },
      data: { status: "error", finishedAt: new Date(), error: "Workflow not found" },
    });
    return;
  }

  const definition = {
    id: row.id,
    name: row.name,
    active: row.active,
    nodes: JSON.parse(row.nodes),
    connections: JSON.parse(row.connections),
    settings: row.settings ? JSON.parse(row.settings) : undefined,
    staticData: row.staticData ? JSON.parse(row.staticData) : undefined,
    pinData: row.pinData ? JSON.parse(row.pinData) : undefined,
    meta: row.meta ? JSON.parse(row.meta) : undefined,
    versionId: row.versionId,
  } as unknown as IWorkflow;

  executeWorkflow({
    workflow: definition,
    nodeExecutors: defaultExecutors,
    pinData,
    credentialResolver: resolveCredential,
    onProgress: async (partial) => {
      await prisma.execution.update({
        where: { id: executionId },
        data: { runData: JSON.stringify(partial) },
      });
    },
  })
    .then(async (result) => {
      await prisma.execution.update({
        where: { id: executionId },
        data: {
          status: result.success ? "success" : "error",
          finishedAt: new Date(),
          runData: JSON.stringify(result.runData),
        },
      });
    })
    .catch(async (err) => {
      await prisma.execution.update({
        where: { id: executionId },
        data: {
          status: "error",
          finishedAt: new Date(),
          error: JSON.stringify({ message: err instanceof Error ? err.message : String(err) }),
        },
      });
    });
}
import { prisma } from "./db";
import { executionQueue } from "./queue";
import { executeWorkflow } from "../lib/engine/runner";
import { getExecutorMap } from "../lib/engine";
import { resolveCredential } from "./credentials";
import {
  definitionFromRow,
  resolveSubWorkflowFromDb,
} from "./workflow-loader";
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

async function resolveDefinition(
  workflowId: string,
  snapshot?: IWorkflow,
): Promise<IWorkflow | null> {
  if (snapshot?.nodes) return snapshot;
  const row = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!row) return null;
  return definitionFromRow(row);
}

export async function enqueueOrRun(
  workflowId: string,
  executionId: string,
  mode: "manual" | "webhook" | "trigger",
  pinData?: Record<string, INodeExecutionData[]>,
  workflow?: IWorkflow,
): Promise<void> {
  if (await checkRedis()) {
    await executionQueue.add("execute", {
      workflowId,
      executionId,
      mode,
      pinData,
      workflow: workflow as unknown as Record<string, unknown> | undefined,
    });
    return;
  }

  const definition = await resolveDefinition(workflowId, workflow);
  if (!definition) {
    await prisma.execution.update({
      where: { id: executionId },
      data: { status: "error", finishedAt: new Date(), error: "Workflow not found" },
    });
    return;
  }

  executeWorkflow({
    workflow: definition,
    nodeExecutors: getExecutorMap(),
    pinData: pinData ?? (definition.pinData as Record<string, INodeExecutionData[]> | undefined),
    credentialResolver: resolveCredential,
    resolveSubWorkflow: resolveSubWorkflowFromDb,
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
          error: result.success
            ? null
            : JSON.stringify({
                message:
                  Object.values(result.runData).find((d) => d.status === "error")?.error ??
                  "Workflow failed",
              }),
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

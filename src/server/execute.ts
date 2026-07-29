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

function definitionFromRow(row: {
  id: string;
  name: string;
  active: boolean;
  nodes: string;
  connections: string;
  settings: string | null;
  staticData: string | null;
  pinData: string | null;
  meta: string | null;
  versionId: string;
}): IWorkflow {
  return {
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
    nodeExecutors: defaultExecutors,
    pinData: pinData ?? (definition.pinData as Record<string, INodeExecutionData[]> | undefined),
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

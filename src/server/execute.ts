import { prisma } from "./db";
import { executionQueue } from "./queue";
import { executeWorkflow } from "../lib/engine/runner";
import { getExecutorMap } from "../lib/engine";
import { credentialResolverForProject, credentialResolverForUser } from "./credentials";
import {
  dataTableAccessForProject,
  dataTableAccessForUser,
} from "./services/data-tables-access";
import {
  definitionFromRow,
  resolveSubWorkflowFromDb,
} from "./workflow-loader";
import { LOCAL_USER_ID } from "./services/users";
import { loadVarsMap } from "./services/variables";
import { getDefaultEnvironment, resolveEnvironment } from "./services/environments";
import { log } from "./log";
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

async function resolveScope(
  workflowId: string,
  userId?: string,
  projectId?: string,
): Promise<{ userId: string; projectId: string }> {
  if (userId && projectId) return { userId, projectId };
  const row = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: { userId: true, projectId: true },
  });
  return {
    userId: userId ?? row?.userId ?? LOCAL_USER_ID,
    projectId: projectId ?? row?.projectId ?? "",
  };
}

async function resolveEnvId(
  projectId: string,
  environmentId?: string | null,
): Promise<string | undefined> {
  if (!projectId) return undefined;
  if (environmentId) {
    const env = await resolveEnvironment(projectId, environmentId);
    return env?.id;
  }
  const def = await getDefaultEnvironment(projectId);
  return def?.id;
}

export async function enqueueOrRun(
  workflowId: string,
  executionId: string,
  mode: "manual" | "webhook" | "trigger",
  pinData?: Record<string, INodeExecutionData[]>,
  workflow?: IWorkflow,
  userId?: string,
  projectId?: string,
  environmentId?: string | null,
): Promise<void> {
  const scope = await resolveScope(workflowId, userId, projectId);
  const envId = await resolveEnvId(scope.projectId, environmentId);

  if (await checkRedis()) {
    await executionQueue.add("execute", {
      workflowId,
      executionId,
      mode,
      userId: scope.userId,
      projectId: scope.projectId,
      environmentId: envId,
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

  const credentialResolver = scope.projectId
    ? credentialResolverForProject(scope.projectId, scope.userId)
    : credentialResolverForUser(scope.userId);
  const dataTables = scope.projectId
    ? dataTableAccessForProject(scope.projectId)
    : dataTableAccessForUser(scope.userId);

  const vars = await loadVarsMap(scope.projectId || null, envId ?? null);

  executeWorkflow({
    workflow: definition,
    nodeExecutors: getExecutorMap(),
    pinData: pinData ?? (definition.pinData as Record<string, INodeExecutionData[]> | undefined),
    credentialResolver,
    dataTables,
    vars,
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
      log.error("in-process execution failed", {
        component: "execute",
        executionId,
        workflowId,
        error: err instanceof Error ? err.message : String(err),
      });
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

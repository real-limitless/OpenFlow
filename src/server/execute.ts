import { prisma } from "./db";
import { executionQueue } from "./queue";
import { executeWorkflow } from "../lib/engine/runner";
import { getExecutorMap } from "../lib/engine";
import { credentialResolverForProject, credentialResolverForUser } from "./credentials";
import { dataTableAccessForProject, dataTableAccessForUser } from "./services/data-tables-access";
import { definitionFromRow, resolveSubWorkflowFromDb } from "./workflow-loader";
import { LOCAL_USER_ID } from "./services/users";
import { loadVarsMap } from "./services/variables";
import { getDefaultEnvironment, resolveEnvironment } from "./services/environments";
import { log } from "./log";
import { notifyExecutionFinished } from "./services/workflow-events";
import { persistExecutionProgress } from "./services/persist-execution-progress";
import { persistPausedExecution } from "./services/durable-wait";
import {
  abortReasonFor,
  assertWorkflowConcurrency,
  discardQueuedJobs,
  finalizeIfActive,
  markExecutionTimeout,
  stampTimeoutDeadline,
} from "./services/execution-governance";
import type { IWorkflow, INodeExecutionData } from "../lib/workflow/types";
import { config } from "../config";
import { requireRedisQueue } from "../lib/runtime/role";

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
  startNode?: string | null,
  destinationNode?: string | null,
  stopBeforeDestination?: boolean,
  startInputItems?: INodeExecutionData[],
): Promise<void> {
  const scope = await resolveScope(workflowId, userId, projectId);
  const envId = await resolveEnvId(scope.projectId, environmentId);
  const start = startNode?.trim() || undefined;
  const dest = destinationNode?.trim() || undefined;
  const stopBefore = stopBeforeDestination !== false;

  const definitionForLimit = await resolveDefinition(workflowId, workflow);
  const quota = await assertWorkflowConcurrency(
    workflowId,
    definitionForLimit?.settings,
    executionId,
  );
  if (!quota.ok) {
    await prisma.execution.update({
      where: { id: executionId },
      data: {
        status: "error",
        finishedAt: new Date(),
        error: JSON.stringify({ code: "concurrency", message: quota.error }),
      },
    });
    notifyExecutionFinished(workflowId, executionId, "error");
    return;
  }

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
      startNode: start,
      destinationNode: dest,
      stopBeforeDestination: stopBefore,
      startInputItems,
    });
    return;
  }

  if (requireRedisQueue(config.worker.role) || !config.worker.enabled) {
    await prisma.execution.update({
      where: { id: executionId },
      data: {
        status: "error",
        finishedAt: new Date(),
        error: JSON.stringify({
          message: "Redis is required to enqueue executions when OPENFLOW_ROLE is main or worker",
        }),
      },
    });
    notifyExecutionFinished(workflowId, executionId, "error");
    return;
  }

  const definition = await resolveDefinition(workflowId, workflow);
  if (!definition) {
    await prisma.execution.update({
      where: { id: executionId },
      data: { status: "error", finishedAt: new Date(), error: "Workflow not found" },
    });
    notifyExecutionFinished(workflowId, executionId, "error");
    return;
  }

  const credentialResolver = scope.projectId
    ? credentialResolverForProject(scope.projectId, scope.userId, envId)
    : credentialResolverForUser(scope.userId, envId);
  const dataTables = scope.projectId
    ? dataTableAccessForProject(scope.projectId)
    : dataTableAccessForUser(scope.userId);

  const vars = await loadVarsMap(scope.projectId || null, envId ?? null);

  const startedAt = Date.now();
  const timeoutMs = await stampTimeoutDeadline(executionId, definition.settings, startedAt);
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs != null) {
    timeoutHandle = setTimeout(() => {
      void markExecutionTimeout(executionId);
    }, timeoutMs);
  }

  executeWorkflow({
    workflow: { ...definition, __executionId: executionId } as typeof definition,
    nodeExecutors: getExecutorMap(),
    pinData: pinData ?? (definition.pinData as Record<string, INodeExecutionData[]> | undefined),
    credentialResolver,
    dataTables,
    vars,
    startNode: start,
    destinationNode: dest,
    stopBeforeDestination: stopBefore,
    resolveSubWorkflow: resolveSubWorkflowFromDb,
    onProgress: async (partial) => {
      await persistExecutionProgress(executionId, partial);
    },
    shouldAbort: () => abortReasonFor(executionId),
    startInputItems,
  })
    .then(async (result) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (result.paused) {
        await persistPausedExecution({
          executionId,
          workflowId,
          userId: scope.userId,
          projectId: scope.projectId,
          environmentId: envId,
          result,
        });
        notifyExecutionFinished(workflowId, executionId, "waiting");
        return;
      }
      if (result.aborted === "cancelled") {
        await finalizeIfActive(executionId, {
          status: "cancelled",
          runData: JSON.stringify(result.runData),
          error: JSON.stringify({ message: "Execution cancelled" }),
        });
        await discardQueuedJobs(executionId);
        notifyExecutionFinished(workflowId, executionId, "cancelled");
        return;
      }
      if (result.aborted === "timeout") {
        await finalizeIfActive(executionId, {
          status: "error",
          runData: JSON.stringify(result.runData),
          error: JSON.stringify({ code: "timeout", message: "Execution timed out" }),
        });
        await discardQueuedJobs(executionId);
        notifyExecutionFinished(workflowId, executionId, "error");
        const { triggerErrorWorkflow } = await import("./services/error-replay");
        await triggerErrorWorkflow({
          sourceWorkflowId: workflowId,
          sourceExecutionId: executionId,
          mode,
          runData: result.runData,
          message: "Execution timed out",
        });
        return;
      }
      const status = result.success ? "success" : "error";
      const wrote = await finalizeIfActive(executionId, {
        status,
        runData: JSON.stringify(result.runData),
        error: result.success
          ? null
          : JSON.stringify({
              message:
                Object.values(result.runData).find((d) => d.status === "error")?.error ??
                "Workflow failed",
            }),
      });
      if (wrote) notifyExecutionFinished(workflowId, executionId, status);
      if (wrote && status === "error") {
        const { triggerErrorWorkflow } = await import("./services/error-replay");
        await triggerErrorWorkflow({
          sourceWorkflowId: workflowId,
          sourceExecutionId: executionId,
          mode,
          runData: result.runData,
          message:
            Object.values(result.runData).find((d) => d.status === "error")?.error ??
            "Workflow failed",
        });
      }
    })
    .catch(async (err) => {
      log.error("in-process execution failed", {
        component: "execute",
        executionId,
        workflowId,
        error: err instanceof Error ? err.message : String(err),
      });
      await finalizeIfActive(executionId, {
        status: "error",
        error: JSON.stringify({ message: err instanceof Error ? err.message : String(err) }),
      });
      notifyExecutionFinished(workflowId, executionId, "error");
    });
}

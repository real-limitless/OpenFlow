import { pathToFileURL } from "node:url";
import { Worker } from "bullmq";
import { prisma } from "./db";
import { connection } from "./queue";
import { getExecutorMap } from "../lib/engine";
import { executeWorkflow } from "../lib/engine/runner";
import { credentialResolverForProject, credentialResolverForUser } from "./credentials";
import { dataTableAccessForProject, dataTableAccessForUser } from "./services/data-tables-access";
import { resolveSubWorkflowFromDb } from "./workflow-loader";
import { loadVarsMap } from "./services/variables";
import { getDefaultEnvironment } from "./services/environments";
import { initBinaryStorage } from "./binary-init";
import { initLogStreaming, log } from "./log";
import { notifyExecutionFinished } from "./services/workflow-events";
import { persistExecutionProgress } from "./services/persist-execution-progress";
import { persistPausedExecution } from "./services/durable-wait";
import {
  abortReasonFor,
  discardQueuedJobs,
  finalizeIfActive,
  markExecutionTimeout,
  stampTimeoutDeadline,
} from "./services/execution-governance";
import type { ExecutionJobData } from "./queue";
import type { INodeExecutionData, IWorkflow } from "../lib/workflow/types";

initLogStreaming();
initBinaryStorage();

let worker: Worker<ExecutionJobData> | null = null;

export function startWorker(concurrency = 5): Worker<ExecutionJobData> {
  if (worker) return worker;

  worker = new Worker<ExecutionJobData>(
    "workflow-execution",
    async (job) => {
      const {
        workflowId,
        executionId,
        pinData,
        workflow: snapshot,
        userId: jobUserId,
        projectId: jobProjectId,
        environmentId: jobEnvironmentId,
        startNode: jobStartNode,
        destinationNode: jobDestinationNode,
        stopBeforeDestination: jobStopBefore,
        startInputItems: jobStartInputItems,
      } = job.data;

      const wlog = log.child({
        executionId,
        workflowId,
        component: "worker",
      });
      wlog.info("execution started");

      let definition: IWorkflow | null = null;
      let ownerId = jobUserId;
      let projectId = jobProjectId;

      if (snapshot && Array.isArray((snapshot as IWorkflow).nodes)) {
        definition = snapshot as unknown as IWorkflow;
      } else {
        const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
        if (!workflow) {
          await prisma.execution.update({
            where: { id: executionId },
            data: { status: "error", finishedAt: new Date(), error: "Workflow not found" },
          });
          notifyExecutionFinished(workflowId, executionId, "error");
          wlog.error("workflow not found");
          throw new Error("Workflow not found");
        }
        ownerId = ownerId || workflow.userId;
        projectId = projectId || workflow.projectId;
        definition = {
          id: workflow.id,
          name: workflow.name,
          active: workflow.active,
          nodes: JSON.parse(workflow.nodes),
          connections: JSON.parse(workflow.connections),
          settings: workflow.settings ? JSON.parse(workflow.settings) : undefined,
          staticData: workflow.staticData ? JSON.parse(workflow.staticData) : undefined,
          pinData: workflow.pinData ? JSON.parse(workflow.pinData) : undefined,
          meta: workflow.meta ? JSON.parse(workflow.meta) : undefined,
          versionId: workflow.versionId,
        } as unknown as IWorkflow;
      }

      if (!ownerId || !projectId) {
        const row = await prisma.workflow.findUnique({
          where: { id: workflowId },
          select: { userId: true, projectId: true },
        });
        ownerId = ownerId || row?.userId || "local";
        projectId = projectId || row?.projectId || "";
      }

      let environmentId = jobEnvironmentId;
      if (!environmentId && projectId) {
        environmentId = (await getDefaultEnvironment(projectId))?.id;
      }
      const credentialResolver = projectId
        ? credentialResolverForProject(projectId, ownerId, environmentId)
        : credentialResolverForUser(ownerId, environmentId);
      const dataTables = projectId
        ? dataTableAccessForProject(projectId)
        : dataTableAccessForUser(ownerId);
      const vars = await loadVarsMap(projectId || null, environmentId ?? null);

      const tagged = { ...definition, __executionId: executionId } as typeof definition;
      const live = await prisma.execution.findUnique({
        where: { id: executionId },
        select: { status: true },
      });
      if (live && live.status !== "running" && live.status !== "waiting") {
        wlog.info("skip stale execution job", { status: live.status });
        return { success: false, skipped: true };
      }

      await prisma.execution.updateMany({
        where: { id: executionId, status: "waiting" },
        data: { status: "running" },
      });

      const startedAt = Date.now();
      const timeoutMs = await stampTimeoutDeadline(executionId, definition.settings, startedAt);
      if (timeoutMs === 0) {
        await markExecutionTimeout(executionId);
        wlog.error("execution timed out");
        notifyExecutionFinished(workflowId, executionId, "error");
        return { success: false, timeout: true };
      }
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs != null) {
        timeoutHandle = setTimeout(() => {
          void markExecutionTimeout(executionId);
        }, timeoutMs);
      }

      const result = await executeWorkflow({
        workflow: tagged,
        nodeExecutors: getExecutorMap(),
        pinData:
          (pinData as unknown as Record<string, INodeExecutionData[]>) ??
          (definition.pinData as Record<string, INodeExecutionData[]> | undefined),
        credentialResolver,
        dataTables,
        vars,
        startNode: jobStartNode,
        destinationNode: jobDestinationNode,
        stopBeforeDestination: jobStopBefore !== false,
        resolveSubWorkflow: resolveSubWorkflowFromDb,
        onProgress: async (partial) => {
          await persistExecutionProgress(executionId, partial);
        },
        shouldAbort: () => abortReasonFor(executionId),
        startInputItems: jobStartInputItems as INodeExecutionData[] | undefined,
      });
      if (timeoutHandle) clearTimeout(timeoutHandle);

      if (result.paused) {
        await persistPausedExecution({
          executionId,
          workflowId,
          userId: ownerId || "local",
          projectId: projectId || "",
          environmentId,
          result,
        });
        wlog.info("execution waiting", { node: result.paused.nodeName, resume: result.paused.resume });
        return { success: true, paused: true };
      }

      if (result.aborted === "cancelled") {
        await finalizeIfActive(executionId, {
          status: "cancelled",
          runData: JSON.stringify(result.runData),
          error: JSON.stringify({ message: "Execution cancelled" }),
        });
        await discardQueuedJobs(executionId);
        notifyExecutionFinished(workflowId, executionId, "cancelled");
        wlog.info("execution cancelled");
        return { success: false, cancelled: true };
      }

      if (result.aborted === "timeout") {
        await finalizeIfActive(executionId, {
          status: "error",
          runData: JSON.stringify(result.runData),
          error: JSON.stringify({ code: "timeout", message: "Execution timed out" }),
        });
        await discardQueuedJobs(executionId);
        notifyExecutionFinished(workflowId, executionId, "error");
        wlog.error("execution timed out");
        const { triggerErrorWorkflow } = await import("./services/error-replay");
        await triggerErrorWorkflow({
          sourceWorkflowId: workflowId,
          sourceExecutionId: executionId,
          mode: job.data.mode,
          runData: result.runData,
          message: "Execution timed out",
        });
        return { success: false, timeout: true };
      }

      const status = result.success ? "success" : "error";
      const wrote = await finalizeIfActive(executionId, {
        status,
        runData: JSON.stringify(result.runData),
      });
      if (wrote) notifyExecutionFinished(workflowId, executionId, status);

      if (result.success) {
        wlog.info("execution succeeded");
      } else {
        const errNode = Object.entries(result.runData).find(([, v]) => v.status === "error");
        wlog.error("execution failed", {
          node: errNode?.[0],
          error: errNode?.[1]?.error,
        });
        const { triggerErrorWorkflow } = await import("./services/error-replay");
        await triggerErrorWorkflow({
          sourceWorkflowId: workflowId,
          sourceExecutionId: executionId,
          mode: job.data.mode,
          runData: result.runData,
          message: errNode?.[1]?.error ?? "Workflow failed",
        });
      }
      return { success: result.success };
    },
    {
      connection,
      concurrency,
    },
  );

  worker.on("completed", (job) => {
    log.debug("job completed", { component: "worker", jobId: job.id });
  });

  worker.on("failed", (job, err) => {
    log.error("job failed", {
      component: "worker",
      jobId: job?.id,
      error: err.message,
    });
  });

  worker.on("error", (err) => {
    log.error("worker error", { component: "worker", error: err.message });
  });

  log.info("worker started", { component: "worker", concurrency, queue: "workflow-execution" });
  return worker;
}

export async function stopWorker(): Promise<void> {
  if (!worker) return;
  await worker.close();
  worker = null;
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
const isMain =
  entry.endsWith("/worker.ts") ||
  entry.endsWith("/worker.js") ||
  entry.endsWith("/worker.mjs") ||
  (typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href);

if (isMain || process.env.RUN_AS_WORKER === "true") {
  startWorker();

  const shutdown = async () => {
    log.info("worker shutting down", { component: "worker" });
    await stopWorker();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

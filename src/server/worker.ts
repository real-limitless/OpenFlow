import { pathToFileURL } from "node:url";
import { Worker } from "bullmq";
import { prisma } from "./db";
import { connection } from "./queue";
import { getExecutorMap } from "../lib/engine";
import { executeWorkflow } from "../lib/engine/runner";
import { credentialResolverForProject, credentialResolverForUser } from "./credentials";
import {
  dataTableAccessForProject,
  dataTableAccessForUser,
} from "./services/data-tables-access";
import { resolveSubWorkflowFromDb } from "./workflow-loader";
import { loadVarsMap } from "./services/variables";
import { getDefaultEnvironment } from "./services/environments";
import { initBinaryStorage } from "./binary-init";
import { initLogStreaming, log } from "./log";
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

      const credentialResolver = projectId
        ? credentialResolverForProject(projectId, ownerId)
        : credentialResolverForUser(ownerId);
      const dataTables = projectId
        ? dataTableAccessForProject(projectId)
        : dataTableAccessForUser(ownerId);
      let environmentId = jobEnvironmentId;
      if (!environmentId && projectId) {
        environmentId = (await getDefaultEnvironment(projectId))?.id;
      }
      const vars = await loadVarsMap(projectId || null, environmentId ?? null);

      const result = await executeWorkflow({
        workflow: definition,
        nodeExecutors: getExecutorMap(),
        pinData:
          (pinData as unknown as Record<string, INodeExecutionData[]>) ??
          (definition.pinData as Record<string, INodeExecutionData[]> | undefined),
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
      });

      await prisma.execution.update({
        where: { id: executionId },
        data: {
          status: result.success ? "success" : "error",
          finishedAt: new Date(),
          runData: JSON.stringify(result.runData),
        },
      });

      if (result.success) {
        wlog.info("execution succeeded");
      } else {
        const errNode = Object.entries(result.runData).find(([, v]) => v.status === "error");
        wlog.error("execution failed", {
          node: errNode?.[0],
          error: errNode?.[1]?.error,
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
  (typeof process.argv[1] === "string" &&
    import.meta.url === pathToFileURL(process.argv[1]).href);

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

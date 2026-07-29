import { pathToFileURL } from "node:url";
import { Worker } from "bullmq";
import { prisma } from "./db";
import { connection } from "./queue";
import { getExecutorMap } from "../lib/engine";
import { executeWorkflow } from "../lib/engine/runner";
import { resolveCredential } from "./credentials";
import { resolveSubWorkflowFromDb } from "./workflow-loader";
import type { ExecutionJobData } from "./queue";
import type { INodeExecutionData, IWorkflow } from "../lib/workflow/types";

let worker: Worker<ExecutionJobData> | null = null;

export function startWorker(concurrency = 5): Worker<ExecutionJobData> {
  if (worker) return worker;

  worker = new Worker<ExecutionJobData>(
    "workflow-execution",
    async (job) => {
      const { workflowId, executionId, pinData, workflow: snapshot } = job.data;

      console.log(`[Worker] Processing execution ${executionId} for workflow ${workflowId}`);

      let definition: IWorkflow | null = null;

      if (snapshot && Array.isArray((snapshot as IWorkflow).nodes)) {
        definition = snapshot as unknown as IWorkflow;
      } else {
        const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
        if (!workflow) {
          await prisma.execution.update({
            where: { id: executionId },
            data: { status: "error", finishedAt: new Date(), error: "Workflow not found" },
          });
          throw new Error("Workflow not found");
        }
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

      const result = await executeWorkflow({
        workflow: definition,
        nodeExecutors: getExecutorMap(),
        pinData:
          (pinData as unknown as Record<string, INodeExecutionData[]>) ??
          (definition.pinData as Record<string, INodeExecutionData[]> | undefined),
        credentialResolver: resolveCredential,
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

      console.log(`[Worker] Execution ${executionId} ${result.success ? "succeeded" : "failed"}`);
      return { success: result.success };
    },
    {
      connection,
      concurrency,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[Worker] Worker error:", err);
  });

  console.log(`[Worker] Started, concurrency: ${concurrency}, queue: workflow-execution`);
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
    console.log("[Worker] Shutting down...");
    await stopWorker();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

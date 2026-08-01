import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config";

export const connection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
});

export interface ExecutionJobData {
  workflowId: string;
  executionId: string;
  mode: "manual" | "webhook" | "trigger";
  /** Workflow owner (audit / fallback). */
  userId: string;
  /** Project scope for credential / data-table resolution. */
  projectId: string;
  /** Environment for $vars overrides (id). */
  environmentId?: string;
  pinData?: Record<string, unknown>;
  /** Canvas snapshot at enqueue time — preferred over DB row when present. */
  workflow?: Record<string, unknown>;
  /** Optional start trigger/node name for partial runs. */
  startNode?: string;
}

export const executionQueue = new Queue<ExecutionJobData>("workflow-execution", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const queueEvents = new QueueEvents("workflow-execution", { connection });

export async function closeQueue() {
  await executionQueue.close();
  await queueEvents.close();
  await connection.quit();
}

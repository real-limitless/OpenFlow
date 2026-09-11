import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config";
import type { INodeExecutionData } from "../lib/workflow/types";

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
  /** Optional destination for “execute previous nodes”. */
  destinationNode?: string;
  /** When true (default), destination itself is not executed. */
  stopBeforeDestination?: boolean;
  /** Items for startNode when replaying from a failed node. */
  startInputItems?: INodeExecutionData[];
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

export const scheduleQueue = new Queue<{ scheduleId: string }>("workflow-schedule", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 50,
  },
});

export async function closeQueue() {
  await executionQueue.close();
  await queueEvents.close();
  await scheduleQueue.close();
  await connection.quit();
}

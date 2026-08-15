import type { ExecutionRunData } from "@/lib/engine/types";
import type { INodeExecutionData } from "@/lib/workflow/types";

export type ExecutionStatus = ExecutionRunData[string]["status"];

export type ExecutionLayoutMode = "list" | "waterfall" | "kanban";

export type ExecutionEntry = {
  name: string;
  status: ExecutionStatus;
  itemCount: number;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  items?: INodeExecutionData[][];
};

export const EXECUTION_LAYOUT_STORAGE_KEY = "openflow.editor.executionLayout.v1";

export const KANBAN_COLUMNS: ExecutionStatus[] = [
  "pending",
  "running",
  "success",
  "error",
  "skipped",
];

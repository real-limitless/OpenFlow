import type { INode, INodeExecutionData, IWorkflow } from "../workflow/types";
import type { ExecutionContext, NodeExecutor } from "@/sdk";

export type { ExecutionContext, NodeExecutor };

/** @deprecated Use ExecutionContext from @/sdk */
export type IExecuteFunctions = ExecutionContext;

export interface ExecutionRunData {
  [nodeName: string]: {
    status: "pending" | "running" | "success" | "error" | "skipped";
    items?: INodeExecutionData[][];
    error?: string;
    startedAt?: string;
    finishedAt?: string;
  };
}

export interface ExecutionPlan {
  workflow: IWorkflow;
  adjacency: Map<string, string[]>;
  startNodes: string[];
  runOrder: string[];
}

export type { INode, IWorkflow, INodeExecutionData };

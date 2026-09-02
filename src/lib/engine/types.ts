import type { INode, INodeExecutionData, IWorkflow } from "../workflow/types";
import type { ExecutionContext, NodeExecutor } from "@/sdk";
import type { AgentTrace, ExecutionNodeProgress } from "./agent-trace";

export type { ExecutionContext, NodeExecutor };
export type { AgentTrace, AgentTraceTurn, ExecutionNodeProgress } from "./agent-trace";

/** @deprecated Use ExecutionContext from @/sdk */
export type IExecuteFunctions = ExecutionContext;

export interface ExecutionRunData {
  [nodeName: string]: {
    status: "pending" | "running" | "success" | "error" | "skipped";
    items?: INodeExecutionData[][];
    error?: string;
    startedAt?: string;
    finishedAt?: string;
    progress?: ExecutionNodeProgress;
    trace?: AgentTrace;
  };
}

export interface ExecutionPlan {
  workflow: IWorkflow;
  adjacency: Map<string, string[]>;
  startNodes: string[];
  runOrder: string[];
}

export type { INode, IWorkflow, INodeExecutionData };

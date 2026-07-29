import type { INode, INodeExecutionData, IWorkflow } from "../workflow/types";
import type { CredentialData } from "./credentials";

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

export interface IExecuteFunctions {
  getNodeInputItems(nodeName: string, inputIndex: number): INodeExecutionData[];
  getWorkflow(): IWorkflow;
  continueOnFail(): boolean;
  getCredential?(name: string): Promise<CredentialData | null>;
}

export type NodeExecutor = (
  ctx: IExecuteFunctions,
  node: INode,
) => Promise<INodeExecutionData[][]>;

import type { INode, INodeExecutionData, IWorkflow } from "@/lib/workflow/types";
import type { INodeTypeDescription } from "@/lib/nodes/types";
import type { CredentialData } from "@/lib/engine/credentials";

/** Single item flowing between nodes (re-export for SDK consumers). */
export type Item = INodeExecutionData;

/** Multi-output bag: outputs[outputIndex][itemIndex]. */
export type NodeOutput = INodeExecutionData[][];

export type { INode, IWorkflow, INodeExecutionData, INodeTypeDescription, CredentialData };

/**
 * Native OpenFlow execution context.
 * Prefer these methods in new code and AI-generated nodes.
 */
export interface ExecutionContext {
  /** Current node with expression-resolved parameters. */
  readonly node: INode;

  /** Items on the given input index for the current node. */
  getInputItems(inputIndex?: number): INodeExecutionData[];

  /** Read a parameter from the current node. */
  getParam<T = unknown>(name: string, defaultValue?: T): T;

  /** All parameters on the current node. */
  getParams(): Record<string, unknown>;

  getNode(): INode;
  getWorkflow(): IWorkflow;
  continueOnFail(): boolean;
  getCredential(name: string): Promise<CredentialData | null>;

  /**
   * Evaluate an expression string against optional item JSON.
   * Returns the raw value; throws or returns original on failure depending on helper.
   */
  evaluate(expression: string, itemJson?: Record<string, unknown>): unknown;

  /**
   * Legacy-compatible lookup used by older executors.
   * Prefer getInputItems for new code.
   */
  getNodeInputItems(nodeName: string, inputIndex: number): INodeExecutionData[];
}

/**
 * Executor signature used by the engine registry.
 * `node` is the same object as `ctx.node` (resolved parameters).
 */
export type NodeExecutor = (
  ctx: ExecutionContext,
  node: INode,
) => Promise<NodeOutput>;

export interface NodeDefinition {
  type: string;
  description?: INodeTypeDescription;
  execute: (ctx: ExecutionContext) => Promise<NodeOutput>;
}

export interface CreateContextOptions {
  node: INode;
  workflow: IWorkflow;
  getNodeInputItems: (nodeName: string, inputIndex: number) => INodeExecutionData[];
  continueOnFail: boolean;
  getCredential?: (name: string) => Promise<CredentialData | null>;
  /** Optional peer node outputs for expression evaluation. */
  nodeData?: Record<string, INodeExecutionData[]>;
}

import type { INode, INodeExecutionData, IWorkflow } from "@/lib/workflow/types";
import type { INodeTypeDescription } from "@/lib/nodes/types";
import type { CredentialData } from "@/lib/engine/credentials";
import type { DataTableAccess } from "@/lib/data-tables/access";
import type { ExecutionNodeProgress } from "@/lib/engine/agent-trace";

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

  /**
   * Run a nested workflow (Execute Workflow node).
   * Optional — only present when the engine was given subWorkflows / a resolver.
   */
  runSubWorkflow?(options: {
    workflowId?: string;
    workflowJson?: IWorkflow;
    items: INodeExecutionData[];
  }): Promise<INodeExecutionData[]>;

  /**
   * Per-execution custom-data store, shared with the Code node's
   * `$execution.customData` API. The Execution Data node writes here; the
   * Code node (and tests) read via {@link getAllCustomData}.
   *
   * Strings only — callers must coerce+truncate before writing.
   * Last-write-wins for repeated keys.
   */
  setCustomData(key: string, value: string): void;
  getCustomData(key: string): string | undefined;
  getAllCustomData(): Record<string, string>;

  /**
   * Product Data Tables access (when the engine was given a resolver).
   * Optional — unit tests and offline runs may omit it.
   */
  dataTables?: DataTableAccess;

  /** Custom variables for `$vars` in expressions. */
  vars?: Record<string, unknown>;

  /**
   * Optional URL policy for HTTP-capable nodes.
   * When set, a false return blocks the request.
   */
  allowUrl?: (url: string) => boolean;

  /** Jail root for filesystem / git tools (harness hosts). */
  fsRoot?: string;

  /**
   * Mid-node progress (Agent turns / current tool). JSON-safe only.
   * The runner persists this onto `runData[node]` while status is `running`.
   */
  reportProgress?(update: {
    progress?: ExecutionNodeProgress;
    trace?: { turns: Array<Record<string, unknown>> };
  }): void | Promise<void>;
}

/**
 * Executor signature used by the engine registry.
 * `node` is the same object as `ctx.node` (resolved parameters).
 */
export type NodeExecutor = (ctx: ExecutionContext, node: INode) => Promise<NodeOutput>;

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
  runSubWorkflow?: ExecutionContext["runSubWorkflow"];
  /**
   * Per-execution custom-data store backing {@link ExecutionContext.setCustomData}
   * et al. When omitted a fresh object is used. The runner passes one store
   * shared across all nodes in an execution.
   */
  customData?: Record<string, string>;
  /** Product Data Tables access for nodes that read/write stored tables. */
  dataTables?: DataTableAccess;
  /** Custom variables for `$vars` in expressions. */
  vars?: Record<string, unknown>;
  /** Env map for `$env`. When omitted, the host may fall back to `process.env`. */
  env?: Record<string, string>;
  /** When set, only these `$env` keys are visible. */
  envAllowlist?: string[];
  /**
   * Optional URL policy for HTTP-capable nodes.
   * When set, a false return blocks the request.
   */
  allowUrl?: (url: string) => boolean;
  /** Jail root for filesystem / git tool paths. */
  fsRoot?: string;
  reportProgress?: ExecutionContext["reportProgress"];
}

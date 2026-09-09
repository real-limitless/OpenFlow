import type { IWorkflow, INodeExecutionData } from "../workflow/types";
import type { ExecutionPlan, ExecutionRunData, NodeExecutor } from "./types";
import type { CredentialResolver } from "./credentials";
import type { DataTableAccess } from "@/lib/data-tables/access";
export declare function createExecutionPlan(workflow: IWorkflow, preferredStart?: string | null, 
/**
 * When set with stopBefore, only ancestors of this node run (for
 * “Execute previous nodes”). When set without stopBefore, run through
 * this node inclusive.
 */
destinationNode?: string | null, stopBefore?: boolean): ExecutionPlan;
export interface RunOptions {
    workflow: IWorkflow;
    nodeExecutors: Record<string, NodeExecutor>;
    pinData?: Record<string, INodeExecutionData[]>;
    credentialResolver?: CredentialResolver;
    /** Called when node status changes or a node reports mid-run progress. */
    onProgress?: (runData: ExecutionRunData) => void | Promise<void>;
    /**
     * Nested workflows available to Execute Workflow, keyed by id and/or name.
     */
    subWorkflows?: Record<string, IWorkflow>;
    /**
     * Async loader for sub-workflows (e.g. database by id or name).
     * Used when the id is not already present in `subWorkflows`.
     */
    resolveSubWorkflow?: (idOrName: string) => Promise<IWorkflow | null>;
    /** Max nested executeWorkflow depth (default 5). */
    maxSubWorkflowDepth?: number;
    /** Internal recursion depth. */
    _depth?: number;
    /** Product Data Tables access for Evaluation / DataTable nodes. */
    dataTables?: DataTableAccess;
    /** Instance + project custom variables exposed as `$vars`. */
    vars?: Record<string, unknown>;
    /**
     * Env map for `$env`. When omitted, falls back to `process.env` (product host).
     * Lite runtime should pass an explicit map (empty object to expose nothing).
     */
    env?: Record<string, string>;
    /** When set, only these `$env` keys are visible. */
    envAllowlist?: string[];
    /**
     * Optional URL policy forwarded to HTTP-capable nodes via the execution context.
     */
    allowUrl?: (url: string) => boolean;
    /** Jail root for filesystem / git tool paths. */
    fsRoot?: string;
    /**
     * Optional start node (usually a trigger name). When set, only that node and
     * its downstream graph run — like n8n’s “execute this trigger”.
     */
    startNode?: string | null;
    /**
     * Optional destination for partial upstream runs (“execute previous nodes”).
     * Combined with {@link stopBeforeDestination} (default true).
     */
    destinationNode?: string | null;
    /** When true (default), destination itself is not executed. */
    stopBeforeDestination?: boolean;
}
export interface RunResult {
    runData: ExecutionRunData;
    success: boolean;
}
export declare function executeWorkflow(options: RunOptions): Promise<RunResult>;

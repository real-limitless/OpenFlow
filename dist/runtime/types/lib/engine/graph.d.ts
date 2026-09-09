import type { IConnections, INode, IWorkflow } from "../workflow/types";
export type TriggerDescriptionLookup = (type: string) => {
    group?: string[];
    category?: string;
    inputs?: unknown[];
    outputs?: unknown[];
    placeholder?: boolean;
} | null;
/** Product registry binds this so unknown trigger types still resolve. Lite leaves it unset. */
export declare function setTriggerDescriptionLookup(fn?: TriggerDescriptionLookup): void;
export declare function isTriggerNode(node: INode): boolean;
/** Enabled trigger nodes on the canvas (for Execute menu). */
export declare function listTriggerNodes(workflow: IWorkflow): INode[];
export declare function buildAdjacency(connections: IConnections): Map<string, string[]>;
export interface IncomingEdge {
    source: string;
    sourceOutput: number;
    targetInput: number;
    /** Target input channel (e.g. main, ai_tool). */
    channel: string;
}
export declare function buildIncoming(connections: IConnections): Map<string, IncomingEdge[]>;
/**
 * Resolve which node(s) start a run.
 * @param preferredStart optional single trigger/node name from the editor
 */
export declare function resolveStartNodes(workflow: IWorkflow, preferredStart?: string | null): string[];
/** All node names reachable from `starts` following outgoing edges (including starts). */
export declare function nodesReachableFrom(adjacency: Map<string, string[]>, starts: string[]): Set<string>;
/**
 * All ancestors of `target` via main (and other) incoming edges, optionally
 * including the target itself.
 */
export declare function nodesLeadingTo(incoming: Map<string, IncomingEdge[]>, target: string, opts?: {
    includeTarget?: boolean;
}): Set<string>;
/**
 * Grow `reachable` to include the sub-nodes the reachable nodes depend on.
 *
 * Sub-nodes (a chat model, a tool, a memory) attach to their parent over a
 * non-`main` channel and point *into* it, so a forward walk from the trigger
 * never lands on them — an agent would run with no model attached. They are
 * dependencies, not downstream steps, so pull them in from the other end.
 *
 * Transitive on purpose: a tool may have its own model hanging off it.
 */
export declare function addSubNodeDependencies(incoming: Map<string, IncomingEdge[]>, reachable: Set<string>): Set<string>;
/** Restrict adjacency to a set of nodes (edges only when both ends are in the set). */
export declare function filterAdjacency(adjacency: Map<string, string[]>, keep: Set<string>): Map<string, string[]>;
export declare function topologicalSort(adjacency: Map<string, string[]>): string[];

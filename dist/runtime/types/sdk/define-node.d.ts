import type { NodeDefinition, NodeExecutor } from "./types";
/**
 * Declare a builtin or plugin node.
 * `type` is the workflow JSON wire identifier.
 */
export declare function defineNode(definition: NodeDefinition): NodeDefinition;
/** Convert a NodeDefinition into the engine's (ctx, node) executor signature. */
export declare function definitionToExecutor(definition: NodeDefinition): NodeExecutor;

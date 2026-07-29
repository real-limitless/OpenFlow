import type { NodeDefinition, NodeExecutor } from "./types";

/**
 * Declare a builtin or plugin node.
 * `type` is the workflow JSON wire identifier.
 */
export function defineNode(definition: NodeDefinition): NodeDefinition {
  if (!definition.type) {
    throw new Error("defineNode: type is required");
  }
  if (typeof definition.execute !== "function") {
    throw new Error(`defineNode(${definition.type}): execute is required`);
  }
  return definition;
}

/** Convert a NodeDefinition into the engine's (ctx, node) executor signature. */
export function definitionToExecutor(definition: NodeDefinition): NodeExecutor {
  return async (ctx) => definition.execute(ctx);
}

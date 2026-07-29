import type { NodeExecutor } from "@/sdk";

/** Entry trigger when a workflow is called as a sub-workflow. */
export const executeWorkflowTriggerExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  if (items.length > 0) return [items];
  return [[{ json: {} }]];
};

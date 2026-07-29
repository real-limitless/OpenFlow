import type { NodeExecutor } from "../types";

export const executeWorkflowExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const workflowId = (node.parameters.workflowId as string) ?? "";

  console.warn(
    `[Execute Workflow] Sub-workflow execution is not yet supported (workflowId="${workflowId}"). ` +
      "Passing input items through unchanged.",
  );

  return [inputItems.length > 0 ? inputItems : [{ json: {} }]];
};

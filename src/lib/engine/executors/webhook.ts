import type { NodeExecutor } from "../types";

export const webhookExecutor: NodeExecutor = async (ctx, node) => {
  const inputData = ctx.getNodeInputItems(node.name, 0);
  return [inputData.length > 0 ? inputData : [{ json: {} }]];
};

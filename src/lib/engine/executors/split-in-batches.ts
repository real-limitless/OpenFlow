import type { NodeExecutor } from "../types";

export const splitInBatchesExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const batchSize = Math.max(1, Number(node.parameters.batchSize ?? 1));

  if (inputItems.length === 0) {
    return [[], []];
  }

  const batch = inputItems.slice(0, batchSize);
  const remaining = inputItems.slice(batchSize);

  return [batch, remaining];
};

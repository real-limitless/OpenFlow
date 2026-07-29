import type { NodeExecutor } from "../types";

export const noopExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }
  return [
    inputItems.map((item, idx) => ({
      ...item,
      pairedItem: item.pairedItem ?? { item: idx, input: 0 },
    })),
  ];
};

import type { NodeExecutor } from "../types";

export const limitExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const maxItems = Math.max(0, Number(node.parameters.maxItems ?? 1));
  const keep = (node.parameters.keep as string) ?? "first";

  if (inputItems.length <= maxItems) {
    return [inputItems];
  }

  if (keep === "last") {
    return [inputItems.slice(inputItems.length - maxItems)];
  }

  return [inputItems.slice(0, maxItems)];
};

import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";

export const noopExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }
  return [inputItems.map((item, idx) => withPairedItem(item, idx))];
};

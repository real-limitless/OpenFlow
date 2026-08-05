import type { NodeExecutor } from "@/sdk";
import { ensureItems } from "@/sdk";

export const raindropExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  return [items];
};
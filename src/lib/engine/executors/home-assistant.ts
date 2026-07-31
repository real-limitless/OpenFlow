import type { NodeExecutor } from "@/sdk";
import { ensureItems } from "@/sdk";

export const homeAssistantExecutor: NodeExecutor = async (ctx, _node) => {
  const items = ensureItems(ctx.getInputItems(0));
  return [items];
};
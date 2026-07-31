import type { NodeExecutor } from "@/sdk";

export const activationTriggerExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  if (items.length > 0) return [items];
  return [[{ json: {} }]];
};
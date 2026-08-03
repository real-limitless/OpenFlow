import type { NodeExecutor } from "@/sdk";

export const calendlyTriggerExecutor: NodeExecutor = async (ctx) => {
  const input = ctx.getInputItems(0);
  if (input.length === 0) {
    return [[]];
  }
  return [input];
};

import type { NodeExecutor } from "../types";

export const manualTriggerExecutor: NodeExecutor = async (_ctx, _node) => {
  return [[{ json: {} }]];
};

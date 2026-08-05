import type { NodeExecutor } from "@/sdk";
import { driftExecutor } from "./drift";

export const driftToolExecutor: NodeExecutor = async (ctx, node) => {
  return driftExecutor(ctx, node);
};

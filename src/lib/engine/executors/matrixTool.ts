import type { NodeExecutor } from "@/sdk";
import { matrixExecutor } from "./matrix";

export const matrixToolExecutor: NodeExecutor = async (ctx, node) => {
  return matrixExecutor(ctx, node);
};

import type { NodeExecutor } from "@/sdk";
import { mauticExecutor } from "./mautic";

export const mauticToolExecutor: NodeExecutor = async (ctx, node) => {
  return mauticExecutor(ctx, node);
};

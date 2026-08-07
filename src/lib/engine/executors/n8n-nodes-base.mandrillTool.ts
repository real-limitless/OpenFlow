import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { mandrillExecutor } from "./mandrill";

export const mandrillToolExecutor: NodeExecutor = async (ctx, node) => {
  return mandrillExecutor(ctx, node);
};

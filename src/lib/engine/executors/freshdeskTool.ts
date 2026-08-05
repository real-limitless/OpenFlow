import type { NodeExecutor } from "@/sdk";
import { freshdeskExecutor } from "./freshdesk";

export const freshdeskToolExecutor: NodeExecutor = async (ctx, node) => {
  return freshdeskExecutor(ctx, node);
};

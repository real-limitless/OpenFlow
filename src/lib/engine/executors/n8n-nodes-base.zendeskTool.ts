import type { NodeExecutor } from "@/sdk";
import { zendeskExecutor } from "./zendesk";

export const zendeskToolExecutor: NodeExecutor = async (ctx, node) => {
  return zendeskExecutor(ctx, node);
};

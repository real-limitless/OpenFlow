import type { NodeExecutor } from "@/sdk";
import { stripeExecutor } from "./n8n-nodes-base.stripe";

export const stripeToolExecutor: NodeExecutor = async (ctx, node) => {
  return stripeExecutor(ctx, node);
};

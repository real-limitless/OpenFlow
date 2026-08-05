import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { awsTranscribeExecutor } from "./awsTranscribe";

export const awsTranscribeToolExecutor: NodeExecutor = async (ctx: ExecutionContext, node: INode) => {
  return awsTranscribeExecutor(ctx, node);
};

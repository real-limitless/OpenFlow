import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { awsS3Executor } from "./awsS3";

export const awsS3ToolExecutor: NodeExecutor = async (ctx: ExecutionContext, node: INode) => {
  return awsS3Executor(ctx, node);
};

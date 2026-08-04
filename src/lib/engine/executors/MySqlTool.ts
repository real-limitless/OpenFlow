import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { mySqlExecutor } from "./mySql";

const handler: NodeExecutor = async (ctx) => {
  return mySqlExecutor(ctx);
};

export const mySqlToolExecutor = handler;

import type { NodeExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";

const ERROR_MESSAGE =
  "The Spontit push notification service has been shut down by its provider. " +
  "This node was removed in n8n v2.0.0. Please remove or replace this node in your workflow.";

export const spontitExecutor: NodeExecutor = async (ctx) => {
  if (ctx.continueOnFail()) {
    const items = ctx.getInputItems(0);
    if (items.length === 0) items.push({ json: {} });
    const errorItems: INodeExecutionData[] = items.map((item) => ({
      ...item,
      json: { ...item.json, error: ERROR_MESSAGE },
    }));
    return [errorItems];
  }
  throw new Error(ERROR_MESSAGE);
};

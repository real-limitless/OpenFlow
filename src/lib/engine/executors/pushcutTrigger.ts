import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface WebhookRequest {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  path?: string;
  method?: string;
  ip?: string;
  webhookUrl?: string;
  executionMode?: string;
}

export const pushcutTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const actionName = ctx.getParam<string>("actionName", "");

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const req = (item.json ?? {}) as WebhookRequest;

    out.push({
      json: {
        headers: req.headers ?? {},
        query: req.query ?? {},
        body: req.body ?? {},
        params: {},
        webhookUrl: req.webhookUrl ?? "",
        executionMode: req.executionMode ?? "test",
        actionName,
      },
      binary: item.binary,
    });
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  return [out];
};

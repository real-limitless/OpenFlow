import type { NodeExecutor } from "../types";

export interface WebhookResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

const webhookResponses = new Map<string, WebhookResponse>();

export function getWebhookResponse(executionId: string): WebhookResponse | undefined {
  return webhookResponses.get(executionId);
}

export function clearWebhookResponse(executionId: string): void {
  webhookResponses.delete(executionId);
}

export const respondToWebhookExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const respondWith = (node.parameters.respondWith as string) ?? "firstIncomingItem";
  const options = (node.parameters.options as Record<string, unknown>) ?? {};
  const responseCode = (options.responseCode as number) ?? 200;

  let body: unknown;

  switch (respondWith) {
    case "allIncomingItems":
      body = inputItems.map((item) => item.json);
      break;
    case "json":
      body = node.parameters.responseBody ?? {};
      break;
    case "text":
      body = node.parameters.responseBody ?? "";
      break;
    case "noData":
      body = null;
      break;
    case "redirect": {
      const url = (node.parameters.redirectURL as string) ?? "";
      body = { redirect: url };
      break;
    }
    case "firstIncomingItem":
    default:
      body = inputItems.length > 0 ? inputItems[0].json : {};
      break;
  }

  const workflow = ctx.getWorkflow();
  const execId = (workflow as Record<string, unknown>).__executionId as string | undefined;
  if (execId) {
    webhookResponses.set(execId, {
      status: respondWith === "noData" ? 204 : responseCode,
      body,
      headers: {},
    });
  }

  if (respondWith === "allIncomingItems") {
    return [inputItems.length > 0 ? inputItems : [{ json: body as Record<string, unknown> }]];
  }

  return [inputItems.length > 0 ? inputItems : [{ json: (body as Record<string, unknown>) ?? {} }]];
};

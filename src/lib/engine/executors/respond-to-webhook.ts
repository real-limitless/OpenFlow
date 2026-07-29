import type { NodeExecutor } from "@/sdk";

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

/** Test helper — clear all stored webhook responses. */
export function clearAllWebhookResponses(): void {
  webhookResponses.clear();
}

export const respondToWebhookExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const respondWith = ctx.getParam<string>("respondWith", "firstIncomingItem");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const responseCode = Number(options.responseCode ?? 200) || 200;

  let body: unknown;
  const headers: Record<string, string> = {};

  switch (respondWith) {
    case "allIncomingItems":
      body = inputItems.map((item) => item.json);
      break;
    case "json": {
      const raw = ctx.getParam("responseBody", {});
      if (typeof raw === "string") {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      } else {
        body = raw ?? {};
      }
      headers["content-type"] = "application/json";
      break;
    }
    case "text":
      body = ctx.getParam("responseBody", "") ?? "";
      headers["content-type"] = "text/html; charset=utf-8";
      break;
    case "noData":
      body = null;
      break;
    case "redirect": {
      const url = ctx.getParam<string>("redirectURL", "") ?? "";
      body = { redirect: url };
      headers.location = url;
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
      status: respondWith === "noData" ? 204 : respondWith === "redirect" ? 302 : responseCode,
      body,
      headers,
    });
  }

  if (respondWith === "allIncomingItems") {
    return [inputItems.length > 0 ? inputItems : [{ json: { items: body } }]];
  }

  if (respondWith === "noData") {
    return [inputItems.length > 0 ? inputItems : [{ json: {} }]];
  }

  return [
    inputItems.length > 0
      ? inputItems
      : [{ json: typeof body === "object" && body !== null ? (body as Record<string, unknown>) : { body } }],
  ];
};

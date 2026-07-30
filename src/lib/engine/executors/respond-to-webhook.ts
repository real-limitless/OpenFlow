import type { NodeExecutor, INodeExecutionData, NodeOutput } from "@/sdk";
import { requireCredential } from "@/sdk";
import { signJwtWithCredential } from "./jwt";

export interface WebhookResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

const webhookResponses = new Map<string, WebhookResponse>();

export function getWebhookResponse(executionId: string): WebhookResponse | undefined {
  return webhookResponses.get(executionId);
}

export function setWebhookResponse(executionId: string, response: WebhookResponse): void {
  webhookResponses.set(executionId, response);
}

export function clearWebhookResponse(executionId: string): void {
  webhookResponses.delete(executionId);
}

/** Test helper — clear all stored webhook responses. */
export function clearAllWebhookResponses(): void {
  webhookResponses.clear();
}

interface HeaderEntry {
  name?: string;
  value?: string;
}

function buildHeaders(options: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {};
  const responseHeaders = options.responseHeaders as { entries?: HeaderEntry[] } | undefined;
  const entries = responseHeaders?.entries ?? [];
  for (const entry of entries) {
    const name = String(entry.name ?? "").toLowerCase();
    if (!name) continue;
    headers[name] = String(entry.value ?? "");
  }
  return headers;
}

function resolveStatusCode(options: Record<string, unknown>, respondWith: string): number {
  const explicit = options.responseCode;
  if (explicit != null && explicit !== "") {
    const n = Number(explicit);
    if (Number.isFinite(n) && n >= 100 && n <= 599) return n;
  }
  return respondWith === "redirect" ? 307 : 200;
}

function resolveJsonBody(raw: unknown): unknown {
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  const text = String(raw).trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON in 'Response Body' field");
  }
}

function resolvePayload(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "object") {
    if (Array.isArray(raw)) return { value: raw };
    return raw as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return {};
  }
}

function fail(ctx: Parameters<NodeExecutor>[0], message: string): NodeOutput {
  if (ctx.continueOnFail()) {
    return [[{ json: { error: message } }]];
  }
  throw new Error(message);
}

export const respondToWebhookExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const respondWith = ctx.getParam<string>("respondWith", "firstIncomingItem");
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const responseKey = String(options.responseKey ?? "");
  const version = Number(node.typeVersion ?? 1);
  const enableResponseOutput = ctx.getParam<boolean>("enableResponseOutput", false) === true;
  const hasResponseOutput = version >= 1.3 && (version < 1.4 || enableResponseOutput);

  const headers = buildHeaders(options);
  const statusCode = resolveStatusCode(options, respondWith);

  let body: unknown;

  try {
    switch (respondWith) {
      case "firstIncomingItem":
        body = inputItems.length > 0 ? inputItems[0].json : {};
        if (responseKey) body = { [responseKey]: body };
        break;
      case "allIncomingItems":
        body = inputItems.map((item) => item.json);
        if (responseKey) body = { [responseKey]: body };
        break;
      case "json":
        body = resolveJsonBody(ctx.getParam("responseBody"));
        break;
      case "text": {
        body = ctx.getParam("responseBody", "") ?? "";
        if (!("content-type" in headers)) {
          headers["content-type"] = "text/html; charset=utf-8";
        }
        break;
      }
      case "noData":
        body = null;
        break;
      case "redirect": {
        const url = ctx.getParam<string>("redirectURL", "") ?? "";
        headers.location = url;
        body = null;
        break;
      }
      case "jwt": {
        const cred = await requireCredential(ctx, "jwtAuth");
        const payload = resolvePayload(ctx.getParam("payload"));
        try {
          const token = signJwtWithCredential(cred, payload);
          body = { token };
        } catch {
          throw new Error("Error signing JWT token");
        }
        break;
      }
      case "binary": {
        const first = inputItems[0];
        const binary = first?.binary;
        const dataSource = ctx.getParam<string>("responseDataSource", "automatically");
        let key: string | undefined;
        if (dataSource === "set") {
          const name = ctx.getParam<string>("inputFieldName", "data");
          key = name || undefined;
        } else if (binary) {
          key = Object.keys(binary)[0];
        }
        const entry = key ? binary?.[key] : undefined;
        if (!entry) {
          throw new Error("No binary data exists on the first item!");
        }
        body = Buffer.from(entry.data ?? "", "base64");
        if (entry.mimeType && !("content-type" in headers)) {
          headers["content-type"] = entry.mimeType;
        }
        break;
      }
      default:
        throw new Error(`The Response Data option "${respondWith}" is not supported!`);
    }
  } catch (err) {
    return fail(ctx, err instanceof Error ? err.message : String(err));
  }

  const response: WebhookResponse = { statusCode, body, headers };
  const workflow = ctx.getWorkflow();
  const execId = (workflow as Record<string, unknown>).__executionId as string | undefined;
  if (execId) {
    webhookResponses.set(execId, response);
  }

  const output0: INodeExecutionData[] = inputItems.length > 0 ? inputItems : [{ json: {} }];

  if (!hasResponseOutput) {
    return [output0];
  }

  const output1: INodeExecutionData[] = [{ json: { response: { body, headers, statusCode } } }];
  return [output0, output1];
};

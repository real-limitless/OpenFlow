import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { setWebhookResponse } from "./respond-to-webhook";

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

const BOT_PATTERN =
  /bot|crawl|spider|preview|slurp|mediapartners|facebookexternalhit|twitterbot|linkedinbot|telegrambot|whatsapp|skypeuripreview/i;

function extractRouteParams(pattern: string, actualPath: string): Record<string, string> {
  const params: Record<string, string> = {};
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = actualPath.split("/").filter(Boolean);
  for (let i = 0; i < patternParts.length && i < pathParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      try {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } catch {
        params[patternParts[i].slice(1)] = pathParts[i];
      }
    }
  }
  return params;
}

function buildResponseHeaders(options: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {};
  const responseHeaders = options.responseHeaders as
    { entries?: Array<{ name?: string; value?: string }> } | undefined;
  for (const entry of responseHeaders?.entries ?? []) {
    const name = String(entry.name ?? "").toLowerCase();
    if (name) headers[name] = String(entry.value ?? "");
  }
  if (!("access-control-allow-origin" in headers)) {
    headers["access-control-allow-origin"] = String(options.allowedOrigins ?? "*");
  }
  return headers;
}

function getExecutionId(ctx: Parameters<NodeExecutor>[0]): string | undefined {
  const workflow = ctx.getWorkflow();
  return (workflow as Record<string, unknown>).__executionId as string | undefined;
}

function normalizeResponseMode(mode: string): string {
  switch (mode) {
    case "immediately":
    case "onReceived":
      return "immediately";
    case "whenLastNode":
    case "lastNode":
      return "whenLastNode";
    case "responseNode":
    case "usingRespondToWebhookNode":
      return "responseNode";
    default:
      return "immediately";
  }
}

/**
 * Webhook trigger — maps an inbound HTTP request to a single output item whose
 * `json` contains: `headers`, `params`, `query`, `body`, `webhookUrl`,
 * `executionMode`.
 *
 * The host (server webhook route) receives the HTTP request, parses it, and
 * feeds it as input items. Each item's `json` carries the raw request fields
 * (`headers`, `query`, `body`, `path`, `ip`, `webhookUrl`, `executionMode`).
 * The executor extracts route params from the configured `path` pattern and
 * builds the documented output shape.
 *
 * Response modes:
 * - `immediately` / `onReceived`: stores `{ statusCode, body: "Workflow got
 *   started", headers }` so the host can return it right away.
 * - `whenLastNode` / `lastNode`: emits the item; the host waits for the last
 *   node and shapes the response from its output (host-level).
 * - `responseNode` / `usingRespondToWebhookNode`: emits the item; a downstream
 *   Respond to Webhook node stores the response.
 *
 * Gaps (documented TODOs):
 * - `options.binaryPropertyName` (binary file data on POST/PATCH/PUT)
 * - `options.rawBody` (raw body parsing — host-level)
 * - `authentication` (basic/header/JWT auth — host-level validation)
 * - Streaming response mode
 */
export const webhookExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const path = ctx.getParam<string>("path", "");
  const responseMode = normalizeResponseMode(ctx.getParam<string>("responseMode", "onReceived"));
  const responseCode = ctx.getParam<number>("responseCode", 200);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const ipWhitelist = options.ipWhitelist as string | undefined;
  const ignoreBots = options.ignoreBots === true;
  const noResponseBody = options.noResponseBody === true;

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const req = (item.json ?? {}) as WebhookRequest;
    const headers = req.headers ?? {};
    const ip = req.ip ?? "";

    if (ipWhitelist && ip) {
      const allowed = ipWhitelist
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!allowed.includes(ip)) {
        const execId = getExecutionId(ctx);
        if (execId) {
          setWebhookResponse(execId, {
            statusCode: 403,
            body: null,
            headers: buildResponseHeaders(options),
          });
        }
        throw new Error("Webhook IP not whitelisted");
      }
    }

    if (ignoreBots) {
      const ua = String(headers["user-agent"] ?? headers["User-Agent"] ?? "");
      if (BOT_PATTERN.test(ua)) {
        continue;
      }
    }

    const params = extractRouteParams(path, req.path ?? "");

    out.push({
      json: {
        headers,
        params,
        query: req.query ?? {},
        body: req.body ?? {},
        webhookUrl: req.webhookUrl ?? "",
        executionMode: req.executionMode ?? "test",
      },
      binary: item.binary,
    });
  }

  if (responseMode === "immediately") {
    const code = (options.responseCode as number) ?? responseCode;
    const body = noResponseBody ? null : "Workflow got started";
    const execId = getExecutionId(ctx);
    if (execId) {
      setWebhookResponse(execId, {
        statusCode: code,
        body,
        headers: buildResponseHeaders(options),
      });
    }
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }
  return [out];
};

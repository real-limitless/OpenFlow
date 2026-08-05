import type { NodeExecutor, INodeExecutionData, SdkHttpResponse } from "@/sdk";
import { requireCredential, withPairedItem, sdkHttpRequest } from "@/sdk";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

export type AnthropicToolHttpClient = (options: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}) => Promise<SdkHttpResponse>;

let httpOverride: AnthropicToolHttpClient | null = null;

export function setAnthropicToolHttpClient(factory: AnthropicToolHttpClient | null): void {
  httpOverride = factory;
}

function resolveModelId(raw: unknown): string {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.value != null) return String(obj.value);
  }
  if (raw == null || raw === "") throw new Error("Anthropic Tool: model id is required");
  return String(raw);
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  };
}

async function anthropicRequest(
  http: typeof sdkHttpRequest,
  url: string,
  body: Record<string, unknown>,
  apiKey: string,
  timeoutMs: number,
): Promise<unknown> {
  const res = await http({
    method: "POST",
    url,
    headers: buildHeaders(apiKey),
    body,
    timeoutMs,
  });
  if (res.status >= 200 && res.status < 300) return res.body;
  const bodyStr = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
  if (res.status === 429) throw new Error(`Anthropic rate limit exceeded. ${bodyStr}`);
  if (res.status === 401 || res.status === 403) throw new Error(`Anthropic authentication error (${res.status}). ${bodyStr}`);
  throw new Error(`Anthropic API error (${res.status}): ${bodyStr}`);
}

function simplifyResponse(body: unknown): Record<string, unknown> {
  const b = body as { content?: Array<{ type?: string; text?: string }>; model?: string; usage?: unknown };
  const textBlocks = (b.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  return {
    messages: [{ role: "assistant", content: textBlocks }],
    model: b.model ?? "",
    usage: b.usage ?? {},
  };
}

export const anthropicToolExecutor: NodeExecutor = async (ctx) => {
  const http = httpOverride ?? sdkHttpRequest;
  const items = ctx.getInputItems(0);

  const credentials = await requireCredential(ctx, "anthropicApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Anthropic Tool: credential "anthropicApi" is missing apiKey');
  }
  const baseUrl = credentials.baseUrl ? String(credentials.baseUrl) : DEFAULT_BASE_URL;

  const outputs: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const json = item.json ?? {};

    const resource = String(json.resource ?? ctx.getParam("resource", "text"));
    const operation = String(json.operation ?? ctx.getParam("operation", "message"));
    const simplify = json.simplify !== undefined ? Boolean(json.simplify) : ctx.getParam("simplify", true);
    const options = (json.options as Record<string, unknown>) ?? ctx.getParam("options", {});

    if (resource === "text" && operation === "message") {
      const modelId = json.modelId ?? ctx.getParam("modelId");
      const model = resolveModelId(modelId);
      const rawMessages = json.messages ?? ctx.getParam("messages");
      const msgs: Array<{ role: string; content: string }> = [];
      let system: string | undefined;

      if (rawMessages && typeof rawMessages === "object" && "values" in (rawMessages as Record<string, unknown>)) {
        const vals = (rawMessages as Record<string, unknown>).values as Array<Record<string, unknown>> | undefined;
        if (vals) {
          for (const m of vals) {
            const role = String(m.role ?? "user");
            const content = String(m.content ?? "");
            if (role === "system") {
              system = system ? system + "\n\n" + content : content;
            } else {
              msgs.push({ role, content });
            }
          }
        }
      }

      const maxTokens = (options.maxTokens as number) ?? 1024;
      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages: msgs.map((m) => ({ role: m.role, content: [{ type: "text", text: m.content }] })),
      };
      if (system) body.system = system;
      if (options.temperature != null) body.temperature = options.temperature;
      if (options.topP != null) body.top_p = options.topP;

      const result = await anthropicRequest(http, `${baseUrl}/v1/messages`, body, apiKey, 120000);
      const outJson = simplify ? simplifyResponse(result) : (result as Record<string, unknown>);
      outputs.push(withPairedItem({ json: outJson }, i));
    } else if (resource === "document" && operation === "analyze") {
      const modelId = json.modelId ?? ctx.getParam("modelId");
      const model = resolveModelId(modelId);
      const text = String(json.text ?? ctx.getParam("text", "What's in this document?"));
      const inputType = String(json.inputType ?? ctx.getParam("inputType", "url"));

      const contentBlocks: Array<Record<string, unknown>> = [];
      if (inputType === "url") {
        const docUrls = String(json.documentUrls ?? ctx.getParam("documentUrls", ""));
        if (docUrls) {
          for (const url of docUrls.split(",").map((s) => s.trim()).filter(Boolean)) {
            contentBlocks.push({ type: "document", source: { type: "url", url } });
          }
        }
      }

      contentBlocks.push({ type: "text", text });

      const body: Record<string, unknown> = {
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: contentBlocks }],
      };

      const result = await anthropicRequest(http, `${baseUrl}/v1/messages`, body, apiKey, 120000);
      const outJson = simplify ? simplifyResponse(result) : (result as Record<string, unknown>);
      outputs.push(withPairedItem({ json: outJson }, i));
    } else if (resource === "image" && operation === "analyze") {
      const modelId = json.modelId ?? ctx.getParam("modelId");
      const model = resolveModelId(modelId);
      const text = String(json.text ?? ctx.getParam("text", "What's in this image?"));
      const inputType = String(json.inputType ?? ctx.getParam("inputType", "url"));

      const contentBlocks: Array<Record<string, unknown>> = [];
      if (inputType === "url") {
        const imageUrls = String(json.imageUrls ?? ctx.getParam("imageUrls", ""));
        if (imageUrls) {
          for (const url of imageUrls.split(",").map((s) => s.trim()).filter(Boolean)) {
            contentBlocks.push({ type: "image", source: { type: "url", url } });
          }
        }
      }

      contentBlocks.push({ type: "text", text });

      const body: Record<string, unknown> = {
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: contentBlocks }],
      };

      const result = await anthropicRequest(http, `${baseUrl}/v1/messages`, body, apiKey, 120000);
      const outJson = simplify
        ? { description: ((result as { content?: Array<{ text?: string }> }).content ?? []).map((c) => c.text ?? "").join("") }
        : (result as Record<string, unknown>);
      outputs.push(withPairedItem({ json: outJson }, i));
    } else if (resource === "file" && operation === "list") {
      const limit = json.limit ?? ctx.getParam("limit", 50);
      const res = await http({
        method: "GET",
        url: `${baseUrl}/v1/files?limit=${limit}`,
        headers: buildHeaders(apiKey),
        timeoutMs: 120000,
      });
      if (res.status >= 200 && res.status < 300) {
        const body = res.body as Record<string, unknown> ?? {};
        outputs.push(withPairedItem({ json: body as Record<string, unknown> }, i));
      } else {
        throw new Error(`Anthropic File List error (${res.status}): ${JSON.stringify(res.body)}`);
      }
    } else if (resource === "prompt" && operation === "generate") {
      const task = String(json.task ?? ctx.getParam("task", ""));
      if (!task) throw new Error("Anthropic Tool: task is required for prompt generate");

      const body: Record<string, unknown> = {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: [{ type: "text", text: `Create a detailed system prompt for the following task: ${task}` }] }],
      };

      const result = await anthropicRequest(http, `${baseUrl}/v1/messages`, body, apiKey, 120000);

      if (simplify) {
        const r = result as { content?: Array<{ text?: string }> };
        const text = (r.content ?? []).map((c) => c.text ?? "").join("");
        outputs.push(withPairedItem({
          json: {
            messages: [{ role: "user", content: text }],
            system: `You are an AI assistant specialized in: ${task}`,
          },
        }, i));
      } else {
        outputs.push(withPairedItem({ json: result as Record<string, unknown> }, i));
      }
    } else {
      throw new Error(`Anthropic Tool: unsupported resource/operation: ${resource}/${operation}`);
    }
  }

  return [outputs];
};

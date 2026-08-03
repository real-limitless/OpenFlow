import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { requireCredential, withPairedItem, sdkHttpRequest, type SdkHttpResponse } from "@/sdk";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

export type AnthropicHttpClient = (options: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}) => Promise<SdkHttpResponse>;

let httpOverride: AnthropicHttpClient | null = null;

export function setAnthropicHttpClient(factory: AnthropicHttpClient | null): void {
  httpOverride = factory;
}

function evalIfExpr(val: unknown, json: Record<string, unknown>, evaluate: (expr: string, json: Record<string, unknown>) => unknown): string {
  if (val == null) return "";
  const str = String(val);
  if (str.startsWith("=")) {
    const resolved = evaluate(str, json);
    return String(resolved ?? "").trim();
  }
  return str;
}

function resolveModelId(modelParam: unknown, firstJson: Record<string, unknown>, evaluate: (expr: string, json: Record<string, unknown>) => unknown): string {
  let raw: unknown = modelParam;
  if (modelParam && typeof modelParam === "object") {
    const obj = modelParam as Record<string, unknown>;
    if (obj.value != null && (obj.mode != null || obj.__rl != null)) {
      raw = obj.value;
    }
  }
  if (raw == null || raw === "") {
    throw new Error("Anthropic: model id is required");
  }
  const str = String(raw);
  if (str.startsWith("=")) {
    const resolved = evaluate(str, firstJson);
    const modelId = String(resolved ?? "").trim();
    if (!modelId) throw new Error("Anthropic: model id resolved to empty");
    return modelId;
  }
  return str;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  };
}

async function anthropicRequest(
  http: AnthropicHttpClient,
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
  if (res.status >= 200 && res.status < 300) {
    return res.body;
  }
  const bodyStr = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
  if (res.status === 429) throw new Error(`Anthropic rate limit exceeded. ${bodyStr}`);
  if (res.status === 401 || res.status === 403) throw new Error(`Anthropic authentication error (${res.status}). ${bodyStr}`);
  throw new Error(`Anthropic API error (${res.status}): ${bodyStr}`);
}

function simplifyResponse(body: unknown, resource: string): Record<string, unknown> {
  const b = body as { content?: Array<{ type?: string; text?: string }>; id?: string; model?: string; type?: string; role?: string };
  const content = (b.content ?? []).filter((c) => c.type === "text").map((c) => ({ type: "text", text: c.text ?? "" }));
  const out: Record<string, unknown> = { content };
  if (resource === "text") {
    out.merged_response = content.map((c) => c.text).join("");
  }
  return out;
}

function getBinaryItem(item: INodeExecutionData, fieldName: string): { data: string; mimeType: string } | null {
  if (!item.binary || !fieldName) return null;
  const bin = item.binary[fieldName];
  if (!bin) return null;
  return { data: bin.data, mimeType: bin.mimeType ?? "application/octet-stream" };
}

function inferMediaType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "document";
  return "document";
}

export const anthropicExecutor: NodeExecutor = async (ctx) => {
  const http = httpOverride ?? sdkHttpRequest;
  const items = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "text");
  const operation = ctx.getParam<string>("operation", "message");
  const simplify = ctx.getParam<boolean>("simplify", true);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const timeoutMs = (options.timeout as number) ?? 120000;

  const credentials = await requireCredential(ctx, "anthropicApi");
  const apiKey = String(credentials.apiKey ?? "");
  if (!apiKey) {
    throw new Error('Anthropic: credential "anthropicApi" is missing apiKey');
  }
  const baseUrl = credentials.baseUrl ? String(credentials.baseUrl) : DEFAULT_BASE_URL;

  const outputs: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const json = item.json ?? {};
    if (resource === "text" && operation === "message") {
      const modelId = ctx.getParam<unknown>("modelId");
      const model = resolveModelId(modelId, json, (expr) => ctx.evaluate(expr, json));

      const rawMessages = ctx.getParam<unknown>("messages");
      const msgs: Array<{ role: string; content: unknown }> = [];
      let system: string | undefined;

      if (rawMessages && typeof rawMessages === "object" && "values" in (rawMessages as Record<string, unknown>)) {
        const vals = (rawMessages as Record<string, unknown>).values as Array<Record<string, unknown>> | undefined;
        if (vals) {
          for (const m of vals) {
            const role = String(m.role ?? "user");
            const content = evalIfExpr(m.content, json, (expr) => ctx.evaluate(expr, json));
            if (role === "system") {
              system = system ? system + "\n\n" + content : content;
            } else {
              msgs.push({ role, content });
            }
          }
        }
      }

      const evaluatedOptions: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(options)) {
        evaluatedOptions[k] = typeof v === "string" && v.startsWith("=") ? ctx.evaluate(v, json) : v;
      }

      const maxTokens = (evaluatedOptions.maxTokens as number) ?? 1024;
      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages: [] as Array<Record<string, unknown>>,
      };
      if (!system && evaluatedOptions.system) system = String(evaluatedOptions.system);
      if (system) body.system = system;
      if (evaluatedOptions.temperature != null) body.temperature = evaluatedOptions.temperature;
      if (evaluatedOptions.topP != null) body.top_p = evaluatedOptions.topP;
      if (evaluatedOptions.topK != null) body.top_k = evaluatedOptions.topK;

      const tools: Array<Record<string, unknown>> = [];
      if (evaluatedOptions.webSearch === true) {
        const ws: Record<string, unknown> = { type: "web_search_20250305" };
        const maxUses = (evaluatedOptions.maxUses as number) ?? 5;
        if (maxUses > 0) ws.max_uses = maxUses;
        if (evaluatedOptions.allowedDomains) {
          ws.allowed_domains = String(evaluatedOptions.allowedDomains).split(",").map((s) => s.trim()).filter(Boolean);
        }
        if (evaluatedOptions.blockedDomains) {
          ws.blocked_domains = String(evaluatedOptions.blockedDomains).split(",").map((s) => s.trim()).filter(Boolean);
        }
        tools.push(ws);
      }
      if (evaluatedOptions.codeExecution === true) {
        tools.push({ type: "code_execution_20250124" });
      }
      if (tools.length > 0) body.tools = tools;

      const addAttachments = ctx.getParam<boolean>("addAttachments", false);
      let attachmentBlocks: Array<Record<string, unknown>> = [];

      if (addAttachments) {
        const attachmentsInputType = ctx.getParam<string>("attachmentsInputType", "url");
        if (attachmentsInputType === "url") {
          const attachmentsUrls = evalIfExpr(ctx.getParam<string>("attachmentsUrls", ""), json, (expr) => ctx.evaluate(expr, json));
          if (attachmentsUrls) {
            for (const url of attachmentsUrls.split(",").map((s) => s.trim()).filter(Boolean)) {
              attachmentBlocks.push({
                type: "document",
                source: { type: "url", url },
              });
            }
          }
        } else {
          const binaryField = evalIfExpr(ctx.getParam<string>("binaryPropertyName", ""), json, (expr) => ctx.evaluate(expr, json));
          if (binaryField) {
            for (const field of binaryField.split(",").map((s) => s.trim()).filter(Boolean)) {
              const bin = getBinaryItem(item, field);
              if (bin) {
                const mediaType = inferMediaType(bin.mimeType);
                attachmentBlocks.push({
                  type: mediaType,
                  source: { type: "base64", media_type: bin.mimeType, data: bin.data },
                });
              }
            }
          }
        }
      }

      const userMsg: Record<string, unknown> = { role: "user" };
      const allContent: Array<unknown> = [];

      if (attachmentBlocks.length > 0) {
        allContent.push(...attachmentBlocks);
      }

      for (const m of msgs) {
        const c = m.content;
        if (typeof c === "string") {
          allContent.push({ type: "text", text: c });
        }
      }

      if (allContent.length > 1) {
        userMsg.content = allContent;
      } else if (allContent.length === 1) {
        userMsg.content = allContent;
      } else if (msgs.length > 0) {
        userMsg.content = msgs.map((m) => ({ type: "text", text: m.content }));
      } else {
        userMsg.content = [{ type: "text", text: "" }];
      }

      body.messages = [userMsg];

      const result = await anthropicRequest(http, `${baseUrl}/v1/messages`, body, apiKey, timeoutMs);

      const outJson = simplify ? simplifyResponse(result, resource) : (result as Record<string, unknown>);
      outputs.push(withPairedItem({ json: outJson }, i));
    } else if (resource === "document" && operation === "analyze") {
      const modelId = ctx.getParam<unknown>("modelId");
      const model = resolveModelId(modelId, json, (expr) => ctx.evaluate(expr, json));
      const text = evalIfExpr(ctx.getParam<string>("text", ""), json, (expr) => ctx.evaluate(expr, json));
      const inputType = ctx.getParam<string>("inputType", "url");

      const contentBlocks: Array<Record<string, unknown>> = [];
      if (inputType === "url") {
        const docUrls = evalIfExpr(ctx.getParam<string>("documentUrls", ""), json, (expr) => ctx.evaluate(expr, json));
        if (docUrls) {
          for (const url of docUrls.split(",").map((s) => s.trim()).filter(Boolean)) {
            contentBlocks.push({
              type: "document",
              source: { type: "url", url },
            });
          }
        }
      } else {
        const binaryField = evalIfExpr(ctx.getParam<string>("binaryPropertyName", ""), json, (expr) => ctx.evaluate(expr, json));
        if (binaryField) {
          for (const field of binaryField.split(",").map((s) => s.trim()).filter(Boolean)) {
            const bin = getBinaryItem(item, field);
            if (bin) {
              contentBlocks.push({
                type: "document",
                source: { type: "base64", media_type: bin.mimeType, data: bin.data },
              });
            }
          }
        }
      }

      contentBlocks.push({ type: "text", text: text || "What's in this document?" });

      const maxTokens = (options.maxTokens as number) ?? 1024;
      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: contentBlocks }],
      };

      const result = await anthropicRequest(http, `${baseUrl}/v1/messages`, body, apiKey, timeoutMs);
      const outJson = simplify ? simplifyResponse(result, resource) : (result as Record<string, unknown>);
      outputs.push(withPairedItem({ json: outJson }, i));
    } else if (resource === "image" && operation === "analyze") {
      const modelId = ctx.getParam<unknown>("modelId");
      const model = resolveModelId(modelId, json, (expr) => ctx.evaluate(expr, json));
      const text = evalIfExpr(ctx.getParam<string>("text", ""), json, (expr) => ctx.evaluate(expr, json));
      const inputType = ctx.getParam<string>("inputType", "url");

      const contentBlocks: Array<Record<string, unknown>> = [];
      if (inputType === "url") {
        const imageUrls = evalIfExpr(ctx.getParam<string>("imageUrls", ""), json, (expr) => ctx.evaluate(expr, json));
        if (imageUrls) {
          for (const url of imageUrls.split(",").map((s) => s.trim()).filter(Boolean)) {
            contentBlocks.push({
              type: "image",
              source: { type: "url", url },
            });
          }
        }
      } else {
        const binaryField = evalIfExpr(ctx.getParam<string>("binaryPropertyName", ""), json, (expr) => ctx.evaluate(expr, json));
        if (binaryField) {
          for (const field of binaryField.split(",").map((s) => s.trim()).filter(Boolean)) {
            const bin = getBinaryItem(item, field);
            if (bin) {
              contentBlocks.push({
                type: "image",
                source: { type: "base64", media_type: bin.mimeType, data: bin.data },
              });
            }
          }
        }
      }

      contentBlocks.push({ type: "text", text: text || "What's in this image?" });

      const maxTokens = (options.maxTokens as number) ?? 1024;
      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: contentBlocks }],
      };

      const result = await anthropicRequest(http, `${baseUrl}/v1/messages`, body, apiKey, timeoutMs);
      const outJson = simplify ? simplifyResponse(result, resource) : (result as Record<string, unknown>);
      outputs.push(withPairedItem({ json: outJson }, i));
    } else if (resource === "file" && operation === "upload") {
      const inputType = ctx.getParam<string>("inputType", "url");
      const fileName = (options.fileName as string) ?? "";

      if (inputType === "url") {
        const fileUrl = evalIfExpr(ctx.getParam<string>("fileUrl", ""), json, (expr) => ctx.evaluate(expr, json));
        if (!fileUrl) throw new Error("Anthropic File Upload: fileUrl is required");

        const body: Record<string, unknown> = { file_url: fileUrl };
        if (fileName) body.filename = fileName;

        const res = await http({
          method: "POST",
          url: `${baseUrl}/v1/files`,
          headers: buildHeaders(apiKey),
          body,
          timeoutMs,
        });

        if (res.status >= 200 && res.status < 300) {
          const b = res.body as Record<string, unknown> ?? {};
          outputs.push(withPairedItem({ json: b as Record<string, unknown> }, i));
        } else {
          throw new Error(`Anthropic File Upload error (${res.status}): ${JSON.stringify(res.body)}`);
        }
      } else {
        const binaryField = evalIfExpr(ctx.getParam<string>("binaryPropertyName", ""), json, (expr) => ctx.evaluate(expr, json)) || "data";
        const bin = getBinaryItem(item, binaryField);
        if (!bin) throw new Error(`Anthropic File Upload: binary field "${binaryField}" not found`);

        const res = await http({
          method: "POST",
          url: `${baseUrl}/v1/files`,
          headers: { ...buildHeaders(apiKey), "content-type": "multipart/form-data" },
          body: { file: bin.data, filename: fileName || "upload.bin" },
          timeoutMs,
        });

        if (res.status >= 200 && res.status < 300) {
          const b = res.body as Record<string, unknown> ?? {};
          outputs.push(withPairedItem({ json: b as Record<string, unknown> }, i));
        } else {
          throw new Error(`Anthropic File Upload error (${res.status}): ${JSON.stringify(res.body)}`);
        }
      }
    } else if (resource === "file" && operation === "getMetadata") {
      const fileId = evalIfExpr(ctx.getParam<string>("fileId", ""), json, (expr) => ctx.evaluate(expr, json));
      if (!fileId) throw new Error("Anthropic: fileId is required");

      const res = await http({
        method: "GET",
        url: `${baseUrl}/v1/files/${fileId}`,
        headers: buildHeaders(apiKey),
        timeoutMs,
      });

      if (res.status >= 200 && res.status < 300) {
        const b = res.body as Record<string, unknown> ?? {};
        outputs.push(withPairedItem({ json: b as Record<string, unknown> }, i));
      } else {
        throw new Error(`Anthropic File Metadata error (${res.status}): ${JSON.stringify(res.body)}`);
      }
    } else if (resource === "file" && operation === "list") {
      const limit = ctx.getParam<number>("limit", 50);

      const res = await http({
        method: "GET",
        url: `${baseUrl}/v1/files?limit=${limit}`,
        headers: buildHeaders(apiKey),
        timeoutMs,
      });

      if (res.status >= 200 && res.status < 300) {
        const b = res.body as Record<string, unknown> ?? {};
        outputs.push(withPairedItem({ json: b as Record<string, unknown> }, i));
      } else {
        throw new Error(`Anthropic File List error (${res.status}): ${JSON.stringify(res.body)}`);
      }
    } else if (resource === "file" && operation === "delete") {
      const fileId = evalIfExpr(ctx.getParam<string>("fileId", ""), json, (expr) => ctx.evaluate(expr, json));
      if (!fileId) throw new Error("Anthropic: fileId is required");

      const res = await http({
        method: "DELETE",
        url: `${baseUrl}/v1/files/${fileId}`,
        headers: buildHeaders(apiKey),
        timeoutMs,
      });

      if (res.status >= 200 && res.status < 300) {
        const b = res.body as Record<string, unknown> ?? {};
        outputs.push(withPairedItem({ json: b as Record<string, unknown> }, i));
      } else {
        throw new Error(`Anthropic File Delete error (${res.status}): ${JSON.stringify(res.body)}`);
      }
    } else if (resource === "prompt" && operation === "generate") {
      const task = evalIfExpr(ctx.getParam<string>("task", ""), json, (expr) => ctx.evaluate(expr, json));
      if (!task) throw new Error("Anthropic Prompt Generate: task is required");

      const body: Record<string, unknown> = {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: `Create a detailed system prompt for the following task: ${task}` }],
      };

      const result = await anthropicRequest(http, `${baseUrl}/v1/messages`, body, apiKey, timeoutMs);

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
    } else if (resource === "prompt" && operation === "improve") {
      const rawMessages = ctx.getParam<unknown>("messages");
      const msgs: Array<{ role: string; content: string }> = [];
      const improvedSystem = evalIfExpr(options.system as string, json, (expr) => ctx.evaluate(expr, json));

      if (rawMessages && typeof rawMessages === "object" && "values" in (rawMessages as Record<string, unknown>)) {
        const vals = (rawMessages as Record<string, unknown>).values as Array<Record<string, unknown>> | undefined;
        if (vals) {
          for (const m of vals) {
            const role = String(m.role ?? "user");
            const content = evalIfExpr(m.content, json, (expr) => ctx.evaluate(expr, json));
            msgs.push({ role, content });
          }
        }
      }

      const feedback = evalIfExpr(options.feedback as string, json, (expr) => ctx.evaluate(expr, json));

      const body: Record<string, unknown> = {
        messages: msgs,
        enableAnthropicBetas: { promptTools: true },
      };
      if (improvedSystem) body.system = improvedSystem;
      if (feedback) body.feedback = feedback;

      const result = await anthropicRequest(http, `${baseUrl}/v1/experimental/improve_prompt`, body, apiKey, timeoutMs);

      if (simplify) {
        const r = result as { messages?: Array<{ role: string; content: string }>; system?: string };
        outputs.push(withPairedItem({
          json: {
            messages: r.messages ?? msgs,
            system: r.system ?? improvedSystem ?? "",
          },
        }, i));
      } else {
        outputs.push(withPairedItem({ json: result as Record<string, unknown> }, i));
      }
    } else if (resource === "prompt" && operation === "templatize") {
      const rawMessages = ctx.getParam<unknown>("messages");
      const msgs: Array<{ role: string; content: string }> = [];
      const templatizedSystem = evalIfExpr(options.system as string, json, (expr) => ctx.evaluate(expr, json));

      if (rawMessages && typeof rawMessages === "object" && "values" in (rawMessages as Record<string, unknown>)) {
        const vals = (rawMessages as Record<string, unknown>).values as Array<Record<string, unknown>> | undefined;
        if (vals) {
          for (const m of vals) {
            const role = String(m.role ?? "user");
            const content = evalIfExpr(m.content, json, (expr) => ctx.evaluate(expr, json));
            msgs.push({ role, content });
          }
        }
      }

      const body: Record<string, unknown> = {
        messages: msgs,
        enableAnthropicBetas: { promptTools: true },
      };
      if (templatizedSystem) body.system = templatizedSystem;

      const result = await anthropicRequest(http, `${baseUrl}/v1/experimental/templatize_prompt`, body, apiKey, timeoutMs);

      if (simplify) {
        const r = result as { messages?: Array<{ role: string; content: string }>; system?: string; variable_values?: object };
        outputs.push(withPairedItem({
          json: {
            messages: r.messages ?? msgs,
            system: r.system ?? templatizedSystem ?? "",
            variable_values: r.variable_values ?? {},
          },
        }, i));
      } else {
        outputs.push(withPairedItem({ json: result as Record<string, unknown> }, i));
      }
    } else {
      throw new Error(`Anthropic: unsupported resource/operation combination: ${resource}/${operation}`);
    }
  }

  return [outputs];
};

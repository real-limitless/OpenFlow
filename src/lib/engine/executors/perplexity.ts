import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { requireCredential } from "@/sdk/helpers/credentials";

const BASE_URL = "https://api.perplexity.ai";

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function simplifyChat(body: Record<string, unknown>): Record<string, unknown> {
  return {
    id: body.id,
    created: body.created,
    citations: body.citations ?? [],
    message:
      (body.choices as Array<{ message: { content: string } }>)?.[0]?.message
        ?.content ?? "",
  };
}

function simplifyAgent(body: Record<string, unknown>): Record<string, unknown> {
  return {
    id: body.id,
    model: body.model,
    output_text:
      (body.output as Array<{ type: string; text?: string }>)
        ?.filter((o) => o.type === "message")
        .map((o) => o.text)
        .join("\n") ?? "",
    citations: body.citations ?? [],
    usage: body.usage,
  };
}

function simplifySearch(body: Record<string, unknown>): Record<string, unknown> {
  return {
    id: body.id,
    results: body.results,
  };
}

export const perplexityExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "chat");
  const operation = ctx.getParam<string>("operation", "complete");
  const simplify = ctx.getParam<boolean>("simplify", false);
  const timeout = ctx.getParam<number>("timeout", 10000);
  const continueOnFail = ctx.continueOnFail();

  let apiKey = "";
  try {
    const cred = await requireCredential(ctx, "perplexityApi");
    apiKey = String(cred.apiKey ?? "");
  } catch {
    apiKey = ctx.getParam<string>("apiKey", "");
  }
  const headers = buildHeaders(apiKey);

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: Record<string, unknown>;

      if (resource === "chat" && operation === "complete") {
        const model = ctx.getParam<string>("model", "sonar");
        const rawMessages = ctx.getParam<{ message?: Array<{ role: string; content: string }> }>("messages", {});
        const messages = rawMessages?.message ?? [];
        const options = ctx.getParam<Record<string, unknown>>("options", {});
        const body: Record<string, unknown> = {
          model,
          messages,
        };
        for (const [k, v] of Object.entries(options)) {
          if (v !== undefined && v !== null && v !== "") {
            body[k] = v;
          }
        }
        const res = await fetch(`${BASE_URL}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        });
        const raw: Record<string, unknown> = await res.json();
        if (!res.ok) {
          result = { ...raw, statusCode: res.status };
        } else {
          result = simplify ? simplifyChat(raw) : raw;
        }
      } else if (resource === "agent" && operation === "createResponse") {
        const input = ctx.getParam<string>("input", "");
        const options = ctx.getParam<Record<string, unknown>>("options", {});
        const body: Record<string, unknown> = { input };
        for (const [k, v] of Object.entries(options)) {
          if (v !== undefined && v !== null && v !== "") {
            body[k] = v;
          }
        }
        const res = await fetch(`${BASE_URL}/v1/agent`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        });
        const raw: Record<string, unknown> = await res.json();
        if (!res.ok) {
          result = { ...raw, statusCode: res.status };
        } else {
          result = simplify ? simplifyAgent(raw) : raw;
        }
      } else if (resource === "embedding") {
        const model = ctx.getParam<string>("model", "pplx-embed-v1-4b");
        const options = ctx.getParam<Record<string, unknown>>("options", {});
        const body: Record<string, unknown> = {
          model,
          input: ctx.getParam<string>("input", ""),
        };
        for (const [k, v] of Object.entries(options)) {
          if (v !== undefined && v !== null && v !== "") {
            body[k] = v;
          }
        }
        const endpoint =
          operation === "createContextualized"
            ? "/v1/contextualizedembeddings"
            : "/v1/embeddings";
        const res = await fetch(`${BASE_URL}${endpoint}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        });
        const raw: Record<string, unknown> = await res.json();
        result = !res.ok ? { ...raw, statusCode: res.status } : raw;
      } else if (resource === "search" && operation === "search") {
        const query = ctx.getParam<string>("query", "");
        const options = ctx.getParam<Record<string, unknown>>("options", {});
        const body: Record<string, unknown> = { query };
        for (const [k, v] of Object.entries(options)) {
          if (v !== undefined && v !== null && v !== "") {
            body[k] = v;
          }
        }
        const res = await fetch(`${BASE_URL}/search`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        });
        const raw: Record<string, unknown> = await res.json();
        if (!res.ok) {
          result = { ...raw, statusCode: res.status };
        } else {
          result = simplify ? simplifySearch(raw) : raw;
        }
      } else {
        throw new Error(
          `Perplexity: unsupported resource/operation: ${resource}/${operation}`,
        );
      }

      out.push({
        json: result,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

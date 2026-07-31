import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

interface GotifyCredential {
  url: string;
  appToken: string;
  clientToken: string;
}

function getToken(cred: GotifyCredential, operation: string): string {
  if (operation === "create") {
    if (!cred.appToken) throw new Error("Gotify: appToken is required for create operation");
    return cred.appToken;
  }
  if (!cred.clientToken) throw new Error("Gotify: clientToken is required for this operation");
  return cred.clientToken;
}

async function gotifyRequest(
  baseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, baseUrl.replace(/\/+$/, ""));
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        "X-Gotify-Key": token,
        "Content-Type": "application/json; charset=utf-8",
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url.toString(), init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = String(
        obj.error ?? obj.message ?? `Gotify request failed with status code ${response.status}`,
      );
      throw new Error(errMsg);
    }
    if (response.status === 204) return null;
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export const gotifyExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("gotifyApi");
  if (!cred) throw new Error("Gotify: gotifyApi credential is required");
  const gotifyCred = cred as unknown as GotifyCredential;
  if (!gotifyCred.url) throw new Error("Gotify: url is required in credential");

  const resource = String(node.parameters.resource ?? "message");
  const operation = String(node.parameters.operation ?? "create");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      if (resource === "message") {
        const result = await handleMessage(gotifyCred, operation, node);
        if (Array.isArray(result)) {
          for (const r of result) {
            out.push({ json: r, pairedItem });
          }
        } else {
          out.push({ json: result, pairedItem });
        }
      } else {
        throw new Error(`Gotify: unsupported resource "${resource}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function handleMessage(
  cred: GotifyCredential,
  operation: string,
  node: { parameters: Record<string, unknown> },
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = getToken(cred, operation);

  if (operation === "create") {
    const body: Record<string, unknown> = {};
    const text = String(node.parameters.text ?? "");
    if (!text) throw new Error("Gotify: text is required for create operation");
    body.message = text;
    const title = String(node.parameters.title ?? "");
    if (title) body.title = title;
    const priorityRaw = node.parameters.priority;
    if (priorityRaw !== undefined && priorityRaw !== "") {
      body.priority = Number(priorityRaw);
    }
    const res = await gotifyRequest(cred.url, token, "POST", "/message", body);
    return asObj(res);
  }

  if (operation === "delete") {
    const messageId = Number(node.parameters.messageId ?? 0);
    if (!messageId) throw new Error("Gotify: messageId is required for delete operation");
    await gotifyRequest(cred.url, token, "DELETE", `/message/${messageId}`);
    return {};
  }

  if (operation === "getAll") {
    const opts = (node.parameters.options ?? {}) as Record<string, unknown>;
    const params: Record<string, string> = {};
    const limitRaw = opts.limit;
    if (limitRaw !== undefined && limitRaw !== "") params.limit = String(Number(limitRaw));
    const sinceRaw = opts.since;
    if (sinceRaw !== undefined && sinceRaw !== "") params.since = String(Number(sinceRaw));
    const res = await gotifyRequest(cred.url, token, "GET", "/message", undefined, params);
    const messages = Array.isArray(res) ? (res as Record<string, unknown>[]) : [];
    return messages.map((m) => asObj(m));
  }

  throw new Error(`Gotify: unsupported message operation "${operation}"`);
}
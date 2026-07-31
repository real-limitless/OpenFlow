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
    const msg = String(node.parameters.message ?? "");
    if (!msg) throw new Error("Gotify: message is required for create operation");
    body.message = msg;
    const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
    const title = String(additionalFields.title ?? "");
    if (title) body.title = title;
    const priorityRaw = additionalFields.priority;
    if (priorityRaw !== undefined && priorityRaw !== "") {
      body.priority = Number(priorityRaw);
    } else {
      body.priority = 1;
    }
    const opts = (node.parameters.options ?? {}) as Record<string, unknown>;
    const contentType = String(opts.contentType ?? "text/plain");
    if (contentType !== "text/plain") {
      body.extras = {
        client: {
          display: { contentType },
        },
      };
    }
    const res = await gotifyRequest(cred.url, token, "POST", "/message", body);
    return asObj(res);
  }

  if (operation === "delete") {
    const messageId = String(node.parameters.messageId ?? "");
    if (!messageId) throw new Error("Gotify: messageId is required for delete operation");
    await gotifyRequest(cred.url, token, "DELETE", `/message/${messageId}`);
    return { success: true };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll ?? false);
    const params: Record<string, string> = {};
    const limitRaw = node.parameters.limit;
    const pageSize = limitRaw !== undefined && limitRaw !== "" ? Number(limitRaw) : 20;
    if (!returnAll) {
      params.limit = String(pageSize);
    }
    const allMessages: Record<string, unknown>[] = [];
    let offset = 0;
    const fetchPage = async (): Promise<boolean> => {
      const pageParams = { ...params, offset: String(offset) };
      const res = await gotifyRequest(cred.url, token, "GET", "/message", undefined, pageParams);
      const obj = res as Record<string, unknown> | undefined;
      const messages = obj?.messages as Record<string, unknown>[] ?? (Array.isArray(res) ? (res as Record<string, unknown>[]) : []);
      if (messages.length === 0) return false;
      for (const m of messages) allMessages.push(asObj(m));
      offset += messages.length;
      if (!returnAll) return false;
      return true;
    };
    let hasMore = await fetchPage();
    while (hasMore) {
      hasMore = await fetchPage();
    }
    return allMessages;
  }

  throw new Error(`Gotify: unsupported message operation "${operation}"`);
}
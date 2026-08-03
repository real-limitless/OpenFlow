import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://slack.com/api";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveResourceLocator(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (typeof resolved === "string") return resolved;
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return String((resolved as Record<string, unknown>).value ?? "");
  }
  return String(resolved ?? "");
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

export const slackToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "message");
  const operation = String(node.parameters.operation ?? "post");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runSlackToolOperation(ctx, node, resource, operation, itemJson, item);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, binary: r.binary, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(node.parameters.authentication ?? "accessToken");
  const credName = authentication === "oAuth2" ? "slackOAuth2Api" : "slackApi";
  const cred = await ctx.getCredential(credName);
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error(`Slack: ${credName} credential is not configured`);
  }
  return accessToken;
}

async function runSlackToolOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown> }[]> {
  const token = await getToken(ctx, node);

  if (resource === "channel") {
    return runChannelOp(token, node, operation, itemJson);
  }
  if (resource === "message") {
    return runMessageOp(token, node, operation, itemJson);
  }
  if (resource === "user") {
    return runUserOp(token, node, operation, itemJson);
  }
  throw new Error(`Slack: unsupported resource "${resource}"`);
}

async function runChannelOp(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown> }[]> {
  if (operation === "create") {
    const name = String(resolveValue(node.parameters.channelId, itemJson) ?? "");
    if (!name) throw new Error("Slack: channel name is required");
    const visibility = String(node.parameters.channelVisibility ?? "public");
    const res = await slackRequest(token, "POST", "conversations.create", { name, is_private: visibility === "private" });
    return { json: asObj(res.channel) };
  }
  if (operation === "get") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const res = await slackRequest(token, "GET", "conversations.info", undefined, { channel });
    return { json: asObj(res.channel) };
  }
  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const channels = await slackRequestAll(token, "conversations.list", "channels", returnAll, limit, {});
    return channels.map((c) => ({ json: c }));
  }
  throw new Error(`Slack: unsupported channel operation "${operation}"`);
}

async function runMessageOp(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown> }[]> {
  if (operation === "post") {
    const select = String(node.parameters.select ?? "channel");
    let channel: string;
    if (select === "user") {
      channel = resolveResourceLocator(node.parameters.user, itemJson);
    } else {
      channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    }
    if (!channel) throw new Error("Slack: channel or user is required");
    const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
    const res = await slackRequest(token, "POST", "chat.postMessage", { channel, text });
    return { json: res };
  }
  if (operation === "update") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const ts = String(resolveValue(node.parameters.ts, itemJson) ?? "");
    if (!ts) throw new Error("Slack: ts is required");
    const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
    const res = await slackRequest(token, "POST", "chat.update", { channel, ts, text });
    return { json: res };
  }
  if (operation === "delete") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const ts = String(resolveValue(node.parameters.ts, itemJson) ?? "");
    if (!ts) throw new Error("Slack: ts is required");
    const res = await slackRequest(token, "POST", "chat.delete", { channel, ts });
    return { json: res };
  }
  if (operation === "search") {
    const query = String(resolveValue(node.parameters.query, itemJson) ?? "");
    if (!query) throw new Error("Slack: query is required");
    const sort = String(node.parameters.sort ?? "timestamp");
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 25);
    const res = await slackRequest(token, "GET", "search.messages", undefined, {
      query,
      sort,
      count: String(returnAll ? 100 : limit),
    });
    const messages = ((res.messages ?? {}) as Record<string, unknown>).matches as
      | Record<string, unknown>[]
      | undefined;
    const list = messages ?? [];
    const sliced = returnAll ? list : list.slice(0, limit);
    return sliced.map((m) => ({ json: m }));
  }
  throw new Error(`Slack: unsupported message operation "${operation}"`);
}

async function runUserOp(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown> }[]> {
  if (operation === "info") {
    const user = resolveResourceLocator(node.parameters.user, itemJson);
    if (!user) throw new Error("Slack: user is required");
    const res = await slackRequest(token, "GET", "users.info", undefined, { user });
    return { json: asObj(res.user) };
  }
  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const members = await slackRequestAll(token, "users.list", "members", returnAll, limit, {});
    return members.map((m) => ({ json: m }));
  }
  throw new Error(`Slack: unsupported user operation "${operation}"`);
}

async function slackRequest(
  token: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = params
    ? `${API_BASE}/${endpoint}?${new URLSearchParams(params).toString()}`
    : `${API_BASE}/${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = String(obj.error ?? `Request failed with status code ${response.status}`);
      throw new Error(errMsg);
    }
    const obj = asObj(parsed);
    if (obj.ok === false) {
      throw new Error(String(obj.error ?? "Slack API request failed"));
    }
    return obj;
  } catch (err) {
    if (err instanceof Error && (err.message.includes("Slack:") || err.message.startsWith("Slack "))) {
      throw err;
    }
    if (err instanceof Error && !err.message.includes("Slack")) {
      throw new Error(`Slack request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function slackRequestAll(
  token: string,
  endpoint: string,
  dataKey: string,
  returnAll: boolean,
  limit: number,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let cursor = "";
  const pageSize = returnAll ? 200 : Math.min(limit, 200);

  do {
    const pageParams: Record<string, string> = { ...params, limit: String(pageSize) };
    if (cursor) pageParams.cursor = cursor;
    const res = await slackRequest(token, "GET", endpoint, undefined, pageParams);
    const items = (res[dataKey] ?? []) as Record<string, unknown>[];
    results.push(...items);
    const metadata = res.response_metadata as Record<string, unknown> | undefined;
    cursor = String(metadata?.next_cursor ?? "");
    if (!returnAll) break;
  } while (cursor && cursor !== "");

  if (!returnAll && limit > 0) {
    return results.slice(0, limit);
  }
  return results;
}

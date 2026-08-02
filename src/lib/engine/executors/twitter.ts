import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.twitter.com/2";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, IBinaryData>;
}

export const twitterExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  if (items.length === 0) {
    return [[]];
  }
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "Tweet");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
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
  const authentication = String(node.parameters.authentication ?? "OAuth2");
  const credName = authentication === "OAuth2" ? "twitterOAuth2Api" : "twitterOAuth1Api";
  const cred = await ctx.getCredential(credName);
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error(`X (Twitter): ${credName} credential is not configured`);
  }
  return accessToken;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  if (resource === "Tweet") {
    return runTweetOperation(ctx, node, operation, itemJson);
  }
  if (resource === "Direct Message") {
    return runDirectMessageOperation(ctx, node, operation, itemJson);
  }
  if (resource === "User") {
    return runUserOperation(ctx, node, operation, itemJson);
  }
  if (resource === "List") {
    return runListOperation(ctx, node, operation, itemJson);
  }
  throw new Error(`X (Twitter): unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// Tweet
// ---------------------------------------------------------------------------

async function runTweetOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  const token = await getToken(ctx, node);
  const simplify = node.parameters.simplify !== false;

  if (operation === "create") {
    const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
    if (!text) throw new Error("X (Twitter): text is required for creating a tweet");
    const res = await twitterRequest(token, "POST", "/tweets", { text });
    return { json: simplify ? asObj(res.data) : res };
  }

  if (operation === "reply") {
    const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
    const tweetId = String(resolveValue(node.parameters.tweetId, itemJson) ?? "") || String(itemJson.tweetId ?? "");
    if (!text || !tweetId) {
      throw new Error("X (Twitter): text and tweetId are required for a reply");
    }
    const body: Record<string, unknown> = {
      text,
      reply: { in_reply_to_tweet_id: tweetId },
    };
    const res = await twitterRequest(token, "POST", "/tweets", body);
    return { json: simplify ? asObj(res.data) : res };
  }

  if (operation === "delete") {
    const tweetId = String(resolveValue(node.parameters.tweetId, itemJson) ?? "");
    if (!tweetId) throw new Error("X (Twitter): tweetId is required");
    const res = await twitterRequest(token, "DELETE", `/tweets/${tweetId}`);
    return { json: { deleted: true, tweet_id: tweetId, ...asObj(res.data) } };
  }

  if (operation === "search") {
    const query = String(resolveValue(node.parameters.searchQuery, itemJson) ?? "");
    if (!query) throw new Error("X (Twitter): searchQuery is required");
    const params: Record<string, string> = { query };
    const res = await twitterRequest(token, "GET", "/tweets/search/recent", undefined, params);
    const tweets = (res.data ?? []) as Record<string, unknown>[];
    if (simplify) {
      return tweets.map((t) => ({ json: t }));
    }
    return { json: res };
  }

  if (operation === "like") {
    const tweetId = String(resolveValue(node.parameters.tweetId, itemJson) ?? "");
    if (!tweetId) throw new Error("X (Twitter): tweetId is required");
    const credential = await ctx.getCredential(
      String(node.parameters.authentication ?? "OAuth2") === "OAuth2" ? "twitterOAuth2Api" : "twitterOAuth1Api",
    );
    const userId = credential ? String(credential.userId ?? "") : "";
    if (!userId) throw new Error("X (Twitter): userId is required from credential for like");
    const res = await twitterRequest(token, "POST", `/users/${userId}/likes`, { tweet_id: tweetId });
    return { json: simplify ? { liked: true, tweet_id: tweetId } : res };
  }

  if (operation === "retweet") {
    const tweetId = String(resolveValue(node.parameters.tweetId, itemJson) ?? "");
    if (!tweetId) throw new Error("X (Twitter): tweetId is required");
    const credential = await ctx.getCredential(
      String(node.parameters.authentication ?? "OAuth2") === "OAuth2" ? "twitterOAuth2Api" : "twitterOAuth1Api",
    );
    const userId = credential ? String(credential.userId ?? "") : "";
    if (!userId) throw new Error("X (Twitter): userId is required from credential for retweet");
    const res = await twitterRequest(token, "POST", `/users/${userId}/retweets`, { tweet_id: tweetId });
    return { json: simplify ? { retweeted: true, tweet_id: tweetId } : res };
  }

  throw new Error(`X (Twitter): unsupported tweet operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Direct Message
// ---------------------------------------------------------------------------

async function runDirectMessageOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const token = await getToken(ctx, node);
  const simplify = node.parameters.simplify !== false;

  if (operation === "create") {
    let recipientId = String(resolveValue(node.parameters.recipientIdentifier, itemJson) ?? "");
    const text = String(resolveValue(node.parameters.messageText, itemJson) ?? "");
    if (!recipientId || !text) {
      throw new Error("X (Twitter): recipientIdentifier and messageText are required for DM");
    }
    if (recipientId.startsWith("@")) {
      const username = recipientId.replace("@", "");
      const userRes = await twitterRequest(token, "GET", `/users/by/username/${username}`);
      const userData = userRes.data as Record<string, unknown> | undefined;
      recipientId = String(userData?.id ?? "");
      if (!recipientId) {
        throw new Error(`X (Twitter): could not resolve username "${username}"`);
      }
    }
    const res = await twitterRequest(token, "POST", `/dm_conversations/with/${recipientId}/messages`, {
      text,
    });
    return { json: simplify ? asObj(res.data) : res };
  }

  throw new Error(`X (Twitter): unsupported DM operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

async function runUserOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const token = await getToken(ctx, node);
  const simplify = node.parameters.simplify !== false;

  if (operation === "get") {
    const identifier = String(resolveValue(node.parameters.userIdentifier, itemJson) ?? "");
    if (!identifier) throw new Error("X (Twitter): userIdentifier is required");
    const isUsername = identifier.startsWith("@");
    const endpoint = isUsername ? `/users/by/username/${identifier.replace("@", "")}` : `/users/${identifier}`;
    const res = await twitterRequest(token, "GET", endpoint);
    return { json: simplify ? asObj(res.data) : res };
  }

  throw new Error(`X (Twitter): unsupported user operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

async function runListOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const token = await getToken(ctx, node);
  const simplify = node.parameters.simplify !== false;

  if (operation === "addMember") {
    const listId = String(resolveValue(node.parameters.listId, itemJson) ?? "");
    const memberId = String(resolveValue(node.parameters.memberIdentifier, itemJson) ?? "");
    if (!listId || !memberId) {
      throw new Error("X (Twitter): listId and memberIdentifier are required");
    }
    const res = await twitterRequest(token, "POST", `/lists/${listId}/members`, { user_id: memberId });
    return { json: simplify ? { added: true, list_id: listId, user_id: memberId } : res };
  }

  throw new Error(`X (Twitter): unsupported list operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function twitterRequest(
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = params
    ? `${API_BASE}${path}?${new URLSearchParams(params).toString()}`
    : `${API_BASE}${path}`;
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
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = String(obj.detail ?? obj.title ?? obj.error ?? `Request failed with status code ${response.status}`);
      throw new Error(errMsg);
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { data: parsed };
  } catch (err) {
    if (err instanceof Error && err.message.includes("X (Twitter)")) {
      throw err;
    }
    if (err instanceof Error && !err.message.includes("X (Twitter)")) {
      throw new Error(`X (Twitter) request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

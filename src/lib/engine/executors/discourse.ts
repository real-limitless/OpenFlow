import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function getParam<T>(ctx: ExecutionContext, name: string, defaultVal: T): T {
  return ctx.getParam<T>(name, defaultVal);
}

function getCollection(
  ctx: ExecutionContext,
  name: string,
): Record<string, unknown> {
  const val = ctx.getParam(name) ?? {};
  if (typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

function buildUrl(baseUrl: string, path: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${path}`;
}

async function discourseRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET") {
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
    if (!response.ok) {
      const msg =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>).errors ?? response.statusText
          : response.statusText;
      throw new Error(`Discourse API error: ${msg}`);
    }
    return { status: response.status, body: parsed };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Discourse request failed: ${String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

interface AuthInfo {
  headers: Record<string, string>;
  baseUrl: string;
}

async function authHeaders(ctx: ExecutionContext): Promise<AuthInfo> {
  const cred = await ctx.getCredential("discourseApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  const apiUsername = cred ? String(cred.username ?? "") : "";
  const baseUrl = cred ? String(cred.url ?? "") : "";
  if (!apiKey || !baseUrl) {
    throw new Error("Discourse: discourseApi credential is not configured");
  }
  return {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Api-Key": apiKey,
      "Api-Username": apiUsername,
    },
    baseUrl,
  };
}

function processBody(body: unknown, unwrapPath?: string): unknown {
  if (!unwrapPath || !body || typeof body !== "object") return body;
  let current: unknown = body;
  for (const part of unwrapPath.split(".")) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return body;
    }
  }
  return current ?? body;
}

export const discourseExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const resource = getParam<string>(ctx, "resource", "post");
  const operation = getParam<string>(ctx, "operation", "create");
  const continueOnFail = ctx.continueOnFail();
  const output: INodeExecutionData[] = [];

  let authInfo: AuthInfo;
  try {
    authInfo = await authHeaders(ctx);
  } catch (e) {
    if (continueOnFail) {
      return [
        items.map((_, i) => ({
          json: { error: e instanceof Error ? e.message : String(e) },
          pairedItem: { item: i, input: 0 },
        })),
      ];
    }
    throw e;
  }
  const { headers, baseUrl } = authInfo;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    try {
      const result = await executeResource(
        ctx,
        resource,
        operation,
        baseUrl,
        headers,
        itemJson,
      );
      output.push({
        json: result,
        pairedItem: { item: idx, input: 0 },
      });
    } catch (e) {
      if (continueOnFail) {
        output.push({
          json: { error: e instanceof Error ? e.message : String(e) },
          pairedItem: { item: idx, input: 0 },
        });
      } else {
        throw e;
      }
    }
  }

  return [output];
};

async function executeResource(
  ctx: ExecutionContext,
  resource: string,
  operation: string,
  baseUrl: string,
  headers: Record<string, string>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (resource) {
    case "category":
      return executeCategory(ctx, operation, baseUrl, headers, itemJson);
    case "group":
      return executeGroup(ctx, operation, baseUrl, headers, itemJson);
    case "post":
      return executePost(ctx, operation, baseUrl, headers, itemJson);
    case "user":
      return executeUser(ctx, operation, baseUrl, headers, itemJson);
    case "userGroup":
      return executeUserGroup(ctx, operation, baseUrl, headers, itemJson);
    default:
      throw new Error(`Unknown resource: ${resource}`);
  }
}

async function executeCategory(
  ctx: ExecutionContext,
  operation: string,
  baseUrl: string,
  headers: Record<string, string>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const name = String(resolveValue(getParam<string>(ctx, "name", ""), itemJson) ?? "");

  if (operation === "create") {
    const color = String(resolveValue(getParam<string>(ctx, "color", ""), itemJson) ?? "");
    const textColor = String(resolveValue(getParam<string>(ctx, "textColor", ""), itemJson) ?? "");
    if (!name || !color || !textColor) {
      throw new Error("name, color, and textColor are required for category create");
    }
    const { body } = await discourseRequest("POST", buildUrl(baseUrl, "/categories.json"), headers, {
      name,
      color,
      text_color: textColor,
    });
    return processBody(body, "category") as Record<string, unknown>;
  }

  if (operation === "getAll") {
    const returnAll = getParam<boolean>(ctx, "returnAll", false);
    const limit = getParam<number>(ctx, "limit", 50);
    const { body } = await discourseRequest("GET", buildUrl(baseUrl, "/categories.json"), headers);
    const categories = processBody(body, "category_list.categories") as unknown[];
    if (Array.isArray(categories)) {
      return returnAll ? { categories } : { categories: categories.slice(0, limit) };
    }
    return { categories: [] };
  }

  if (operation === "update") {
    const categoryId = getParam<string>(ctx, "categoryId", "");
    if (!categoryId) throw new Error("categoryId is required for category update");
    const updateFields = getCollection(ctx, "updateFields");
    const bodyPayload: Record<string, unknown> = { name };
    if (updateFields.color) bodyPayload.color = updateFields.color;
    if (updateFields.textColor) bodyPayload.text_color = updateFields.textColor;
    const { body } = await discourseRequest(
      "PUT",
      buildUrl(baseUrl, `/categories/${categoryId}.json`),
      headers,
      bodyPayload,
    );
    return processBody(body, "category") as Record<string, unknown>;
  }

  throw new Error(`Unknown category operation: ${operation}`);
}

async function executeGroup(
  ctx: ExecutionContext,
  operation: string,
  baseUrl: string,
  headers: Record<string, string>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const name = String(resolveValue(getParam<string>(ctx, "name", ""), itemJson) ?? "");

  if (operation === "create") {
    if (!name) throw new Error("name is required for group create");
    const { body } = await discourseRequest("POST", buildUrl(baseUrl, "/admin/groups.json"), headers, {
      group: { name },
    });
    return processBody(body, "basic_group") as Record<string, unknown>;
  }

  if (operation === "get") {
    if (!name) throw new Error("name is required for group get");
    const { body } = await discourseRequest(
      "GET",
      buildUrl(baseUrl, `/groups/${encodeURIComponent(name)}`),
      headers,
    );
    return processBody(body, "group") as Record<string, unknown>;
  }

  if (operation === "getAll") {
    const returnAll = getParam<boolean>(ctx, "returnAll", false);
    const limit = getParam<number>(ctx, "limit", 50);
    const { body } = await discourseRequest("GET", buildUrl(baseUrl, "/groups.json"), headers);
    const groups = processBody(body, "groups") as unknown[];
    if (Array.isArray(groups)) {
      return returnAll ? { groups } : { groups: groups.slice(0, limit) };
    }
    return { groups: [] };
  }

  if (operation === "update") {
    const groupId = getParam<string>(ctx, "groupId", "");
    if (!groupId) throw new Error("groupId is required for group update");
    const { body } = await discourseRequest(
      "PUT",
      buildUrl(baseUrl, `/groups/${groupId}.json`),
      headers,
      { group: { name } },
    );
    return body as Record<string, unknown>;
  }

  throw new Error(`Unknown group operation: ${operation}`);
}

async function executePost(
  ctx: ExecutionContext,
  operation: string,
  baseUrl: string,
  headers: Record<string, string>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (operation === "create") {
    const content = String(resolveValue(getParam<string>(ctx, "content", ""), itemJson) ?? "");
    const title = String(resolveValue(getParam<string>(ctx, "title", ""), itemJson) ?? "");
    if (!content) throw new Error("content is required for post create");
    const additionalFields = getCollection(ctx, "additionalFields");
    const bodyPayload: Record<string, unknown> = { raw: content };
    if (title) bodyPayload.title = title;
    if (additionalFields.category) bodyPayload.category = additionalFields.category;
    if (additionalFields.reply_to_post_number) bodyPayload.reply_to_post_number = additionalFields.reply_to_post_number;
    if (additionalFields.topic_id) bodyPayload.topic_id = additionalFields.topic_id;
    const { body } = await discourseRequest("POST", buildUrl(baseUrl, "/posts.json"), headers, bodyPayload);
    return body as Record<string, unknown>;
  }

  if (operation === "get") {
    const postId = getParam<string>(ctx, "postId", "");
    if (!postId) throw new Error("postId is required for post get");
    const { body } = await discourseRequest(
      "GET",
      buildUrl(baseUrl, `/posts/${postId}`),
      headers,
    );
    return body as Record<string, unknown>;
  }

  if (operation === "getAll") {
    const returnAll = getParam<boolean>(ctx, "returnAll", false);
    const limit = getParam<number>(ctx, "limit", 50);
    const { body } = await discourseRequest("GET", buildUrl(baseUrl, "/posts.json"), headers);
    const posts = processBody(body, "latest_posts") as unknown[];
    if (Array.isArray(posts)) {
      return returnAll ? { posts } : { posts: posts.slice(0, limit) };
    }
    return { posts: [] };
  }

  if (operation === "update") {
    const postId = getParam<string>(ctx, "postId", "");
    const content = String(resolveValue(getParam<string>(ctx, "content", ""), itemJson) ?? "");
    if (!postId) throw new Error("postId is required for post update");
    if (!content) throw new Error("content is required for post update");
    const updateFields = getCollection(ctx, "updateFields");
    const bodyPayload: Record<string, unknown> = { raw: content };
    if (updateFields.edit_reason) bodyPayload.edit_reason = updateFields.edit_reason;
    if (updateFields.cooked) bodyPayload.cooked = updateFields.cooked;
    const { body } = await discourseRequest(
      "PUT",
      buildUrl(baseUrl, `/posts/${postId}.json`),
      headers,
      bodyPayload,
    );
    return processBody(body, "post") as Record<string, unknown>;
  }

  throw new Error(`Unknown post operation: ${operation}`);
}

async function executeUser(
  ctx: ExecutionContext,
  operation: string,
  baseUrl: string,
  headers: Record<string, string>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (operation === "create") {
    const name = String(resolveValue(getParam<string>(ctx, "name", ""), itemJson) ?? "");
    const email = String(resolveValue(getParam<string>(ctx, "email", ""), itemJson) ?? "");
    const username = String(resolveValue(getParam<string>(ctx, "username", ""), itemJson) ?? "");
    const password = String(resolveValue(getParam<string>(ctx, "password", ""), itemJson) ?? "");
    if (!name || !email || !username || !password) {
      throw new Error("name, email, username, and password are required for user create");
    }
    const additionalFields = getCollection(ctx, "additionalFields");
    const bodyPayload: Record<string, unknown> = { name, email, username, password };
    if (additionalFields.active !== undefined) bodyPayload.active = additionalFields.active;
    if (additionalFields.approved !== undefined) bodyPayload.approved = additionalFields.approved;
    const { body } = await discourseRequest("POST", buildUrl(baseUrl, "/users.json"), headers, bodyPayload);
    return body as Record<string, unknown>;
  }

  if (operation === "get") {
    const by = getParam<string>(ctx, "by", "username");
    if (by === "username") {
      const username = String(resolveValue(getParam<string>(ctx, "username", ""), itemJson) ?? "");
      if (!username) throw new Error("username is required for user get by username");
      const { body } = await discourseRequest(
        "GET",
        buildUrl(baseUrl, `/users/${encodeURIComponent(username)}`),
        headers,
      );
      return body as Record<string, unknown>;
    } else {
      const externalId = String(resolveValue(getParam<string>(ctx, "externalId", ""), itemJson) ?? "");
      if (!externalId) throw new Error("externalId is required for user get by externalId");
      const { body } = await discourseRequest(
        "GET",
        buildUrl(baseUrl, `/u/by-external/${encodeURIComponent(externalId)}.json`),
        headers,
      );
      return body as Record<string, unknown>;
    }
  }

  if (operation === "getAll") {
    const flag = getParam<string>(ctx, "flag", "active");
    const returnAll = getParam<boolean>(ctx, "returnAll", false);
    const limit = getParam<number>(ctx, "limit", 50);
    const opts = getCollection(ctx, "options");
    const queryParams = new URLSearchParams();
    if (opts.order) queryParams.set("order", String(opts.order));
    if (opts.asc !== undefined) queryParams.set("asc", String(opts.asc));
    if (opts.showEmails !== undefined) queryParams.set("show_emails", String(opts.showEmails));
    if (opts.stats !== undefined) queryParams.set("stats", String(opts.stats));
    const qs = queryParams.toString();
    const url = buildUrl(baseUrl, `/admin/users/list/${flag}.json${qs ? `?${qs}` : ""}`);
    const { body } = await discourseRequest("GET", url, headers);
    const users = Array.isArray(body) ? (body as unknown[]) : [];
    if (!returnAll && users.length > limit) {
      return { users: users.slice(0, limit) };
    }
    return { users };
  }

  throw new Error(`Unknown user operation: ${operation}`);
}

async function executeUserGroup(
  ctx: ExecutionContext,
  operation: string,
  baseUrl: string,
  headers: Record<string, string>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const usernames = String(resolveValue(getParam<string>(ctx, "usernames", ""), itemJson) ?? "");
  const groupId = String(resolveValue(getParam<string>(ctx, "groupId", ""), itemJson) ?? "");
  if (!usernames) throw new Error("usernames is required");
  if (!groupId) throw new Error("groupId is required");

  if (operation === "add") {
    const { body } = await discourseRequest(
      "PUT",
      buildUrl(baseUrl, `/groups/${groupId}/members.json`),
      headers,
      { usernames },
    );
    return body as Record<string, unknown>;
  }

  if (operation === "remove") {
    const { body } = await discourseRequest(
      "DELETE",
      buildUrl(baseUrl, `/groups/${groupId}/members.json`),
      headers,
      { usernames },
    );
    return body as Record<string, unknown>;
  }

  throw new Error(`Unknown userGroup operation: ${operation}`);
}

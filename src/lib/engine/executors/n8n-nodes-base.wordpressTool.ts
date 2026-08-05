import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
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

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function getCredential(ctx: ExecutionContext): Promise<{ baseUrl: string; auth: Record<string, string> }> {
  let cred = await ctx.getCredential("wordpressApi");
  let isOAuth2 = false;
  if (!cred) {
    cred = await ctx.getCredential("wordpressOAuth2Api");
    if (!cred) throw new Error("WordPress: neither wordpressApi nor wordpressOAuth2Api credential is configured");
    isOAuth2 = true;
  }
  const credData = cred as Record<string, unknown>;
  const url = String(credData.url ?? "");
  if (!url) throw new Error("WordPress: site URL is required in credential");
  let baseUrl = url.replace(/\/+$/, "");
  let auth: Record<string, string>;
  if (isOAuth2) {
    const accessToken = String(credData.accessToken ?? "");
    auth = { Authorization: `Bearer ${accessToken}` };
  } else {
    const username = String(credData.username ?? "");
    const password = String(credData.password ?? "");
    const encoded = Buffer.from(`${username}:${password}`).toString("base64");
    auth = { Authorization: `Basic ${encoded}` };
  }
  return { baseUrl, auth };
}

async function wpRequest(
  baseUrl: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
  auth?: Record<string, string>,
): Promise<unknown> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = path ? `${baseUrl}/${path}${qs}` : `${baseUrl}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      ...auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = parsed && typeof parsed === "object" ? asObj(parsed as Record<string, unknown>) : {};
      const errMsg = (obj.message as string) ?? (obj.code as string) ?? `Request failed with status code ${response.status}`;
      const err = new Error(errMsg);
      (err as unknown as Record<string, unknown>).status = response.status;
      throw err;
    }
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed)) return parsed;
      return asObj(parsed as Record<string, unknown>);
    }
    return { data: parsed };
  } finally {
    clearTimeout(timer);
  }
}

function parseAdditionalFields(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const raw = resolveValue(node.parameters.additionalFields, itemJson);
  if (!raw || raw === "{}") return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function parseOptions(node: INode, itemJson: Record<string, unknown>): Record<string, string> {
  const raw = resolveValue(node.parameters.options, itemJson);
  if (!raw || raw === "{}") return {};
  const obj = typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : (() => { try { return JSON.parse(String(raw)); } catch { return {}; } })();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") out[k] = String(v);
  }
  return out;
}

export const wordpressToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "post");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();
  const { baseUrl, auth } = await getCredential(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(resource, operation, node, itemJson, baseUrl, auth);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: asObj(r), pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message } }, pairedItem });
    }
  }

  return [out];
};

async function runOperation(
  resource: string,
  operation: string,
  node: INode,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  auth: Record<string, string>,
): Promise<unknown | unknown[]> {
  if (resource === "post") return runPostPage("posts", node, itemJson, baseUrl, auth);
  if (resource === "page") return runPostPage("pages", node, itemJson, baseUrl, auth);
  if (resource === "user") return runUser(node, itemJson, baseUrl, auth);
  throw new Error(`WordPress: unsupported resource "${resource}"`);
}

async function runPostPage(
  wpResource: string,
  node: INode,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  auth: Record<string, string>,
): Promise<unknown | unknown[]> {
  const apiBase = `${baseUrl}/wp-json/wp/v2/${wpResource}`;
  const operation = String(node.parameters.operation ?? "create");

  if (operation === "create" || operation === "update") {
    const body: Record<string, unknown> = {};
    const title = resolveValue(node.parameters.title, itemJson);
    if (title !== undefined && title !== null) body.title = String(title);
    const content = resolveValue(node.parameters.content, itemJson);
    if (content !== undefined && content !== null && content !== "") body.content = String(content);
    const additional = parseAdditionalFields(node, itemJson);
    Object.assign(body, additional);

    if (operation === "create") {
      const res = await wpRequest(apiBase, "POST", "", body, {}, auth);
      return res;
    } else {
      const idParam = wpResource === "posts" ? "postId" : "pageId";
      const id = resolveValue(node.parameters[idParam], itemJson);
      if (id === undefined || id === null || id === "") throw new Error(`WordPress: ${idParam} is required for update`);
      const res = await wpRequest(apiBase, "POST", String(id), body, {}, auth);
      return res;
    }
  }

  if (operation === "get") {
    const idParam = wpResource === "posts" ? "postId" : "pageId";
    const id = resolveValue(node.parameters[idParam], itemJson);
    if (id === undefined || id === null || id === "") throw new Error(`WordPress: ${idParam} is required for get`);
    const params = parseOptions(node, itemJson);
    const res = await wpRequest(apiBase, "GET", String(id), undefined, params, auth);
    return res;
  }

  if (operation === "getAll") {
    const returnAll = resolveValue(node.parameters.returnAll, itemJson);
    const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 50);
    const params = parseOptions(node, itemJson);
    const res = await wpRequest(apiBase, "GET", "", undefined, params, auth);
    const items = Array.isArray(res) ? res : [];
    return returnAll ? items : items.slice(0, Math.max(1, limit));
  }

  if (operation === "delete") {
    const idParam = wpResource === "posts" ? "postId" : "pageId";
    const id = resolveValue(node.parameters[idParam], itemJson);
    if (id === undefined || id === null || id === "") throw new Error(`WordPress: ${idParam} is required for delete`);
    const params = parseOptions(node, itemJson);
    const res = await wpRequest(apiBase, "DELETE", String(id), undefined, params, auth);
    return res;
  }

  throw new Error(`WordPress: unsupported ${wpResource} operation "${operation}"`);
}

async function runUser(
  node: INode,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  auth: Record<string, string>,
): Promise<unknown | unknown[]> {
  const apiBase = `${baseUrl}/wp-json/wp/v2/users`;
  const operation = String(node.parameters.operation ?? "create");

  if (operation === "create" || operation === "update") {
    const body: Record<string, unknown> = {};
    const username = resolveValue(node.parameters.username, itemJson);
    if (username !== undefined && username !== null) body.username = String(username);
    const password = resolveValue(node.parameters.password, itemJson);
    if (password !== undefined && password !== null) body.password = String(password);
    const email = resolveValue(node.parameters.email, itemJson);
    if (email !== undefined && email !== null) body.email = String(email);
    const name = resolveValue(node.parameters.name, itemJson);
    if (name !== undefined && name !== null) body.name = String(name);
    const firstName = resolveValue(node.parameters.firstName, itemJson);
    if (firstName !== undefined && firstName !== null) body.first_name = String(firstName);
    const lastName = resolveValue(node.parameters.lastName, itemJson);
    if (lastName !== undefined && lastName !== null) body.last_name = String(lastName);
    const additional = parseAdditionalFields(node, itemJson);
    Object.assign(body, additional);

    if (operation === "create") {
      const res = await wpRequest(apiBase, "POST", "", body, {}, auth);
      return res;
    } else {
      const userId = resolveValue(node.parameters.userId, itemJson);
      if (userId === undefined || userId === null || userId === "") throw new Error("WordPress: userId is required for user update");
      const res = await wpRequest(apiBase, "POST", String(userId), body, {}, auth);
      return res;
    }
  }

  if (operation === "get") {
    const userId = resolveValue(node.parameters.userId, itemJson);
    if (userId === undefined || userId === null || userId === "") throw new Error("WordPress: userId is required for user get");
    const params = parseOptions(node, itemJson);
    const res = await wpRequest(apiBase, "GET", String(userId), undefined, params, auth);
    return res;
  }

  if (operation === "getAll") {
    const returnAll = resolveValue(node.parameters.returnAll, itemJson);
    const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 50);
    const params = parseOptions(node, itemJson);
    const res = await wpRequest(apiBase, "GET", "", undefined, params, auth);
    const items = Array.isArray(res) ? res : [];
    return returnAll ? items : items.slice(0, Math.max(1, limit));
  }

  if (operation === "delete") {
    const userId = resolveValue(node.parameters.userId, itemJson);
    if (userId === undefined || userId === null || userId === "") throw new Error("WordPress: userId is required for user delete");
    const reassign = resolveValue(node.parameters.reassign, itemJson);
    const params = parseOptions(node, itemJson);
    if (reassign !== undefined && reassign !== null && reassign !== "") params.reassign = String(reassign);
    const res = await wpRequest(apiBase, "DELETE", String(userId), undefined, params, auth);
    return res;
  }

  throw new Error(`WordPress: unsupported user operation "${operation}"`);
}
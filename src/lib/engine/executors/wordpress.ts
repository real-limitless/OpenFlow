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

interface OpResult {
  json: Record<string, unknown>;
}

type OpResultList = OpResult | OpResult[];

export const wordpressExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "post");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return [out];
};

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

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (resource === "post") return runPostPageOperation(ctx, node, operation, itemJson, "posts");
  if (resource === "page") return runPostPageOperation(ctx, node, operation, itemJson, "pages");
  if (resource === "user") return runUserOperation(ctx, node, operation, itemJson);
  throw new Error(`WordPress: unsupported resource "${resource}"`);
}

async function runPostPageOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  wpResource: string,
): Promise<OpResultList> {
  const { baseUrl, auth } = await getCredential(ctx);
  const apiBase = `${baseUrl}/wp-json/wp/v2/${wpResource}`;

  if (operation === "create") {
    const body: Record<string, unknown> = {};
    const title = resolveValue(node.parameters.title, itemJson);
    if (title) body.title = String(title);
    const content = resolveValue(node.parameters.content, itemJson);
    if (content) body.content = String(content);
    const slug = resolveValue(node.parameters.slug, itemJson);
    if (slug) body.slug = String(slug);
    const password = resolveValue(node.parameters.password, itemJson);
    if (password) body.password = String(password);
    const status = resolveValue(node.parameters.status, itemJson);
    if (status) body.status = String(status);
    const author = resolveValue(node.parameters.author, itemJson);
    if (author !== undefined && author !== null && author !== "") body.author = Number(author);
    const featuredMedia = resolveValue(node.parameters.featuredMedia, itemJson);
    if (featuredMedia !== undefined && featuredMedia !== null && featuredMedia !== "") body.featured_media = Number(featuredMedia);
    const commentStatus = resolveValue(node.parameters.commentStatus, itemJson);
    if (commentStatus) body.comment_status = String(commentStatus);
    const pingStatus = resolveValue(node.parameters.pingStatus, itemJson);
    if (pingStatus) body.ping_status = String(pingStatus);
    const excerpt = resolveValue(node.parameters.excerpt, itemJson);
    if (excerpt) body.excerpt = String(excerpt);
    const template = resolveValue(node.parameters.template, itemJson);
    if (template) body.template = String(template);
    const date = resolveValue(node.parameters.date, itemJson);
    if (date) body.date = String(date);
    const dateGmt = resolveValue(node.parameters.dateGmt, itemJson);
    if (dateGmt) body.date_gmt = String(dateGmt);
    if (wpResource === "posts") {
      const format = resolveValue(node.parameters.format, itemJson);
      if (format) body.format = String(format);
      const sticky = resolveValue(node.parameters.sticky, itemJson);
      if (sticky !== undefined && sticky !== null) body.sticky = Boolean(sticky);
      const categories = resolveValue(node.parameters.categories, itemJson);
      if (Array.isArray(categories)) body.categories = categories;
      const tags = resolveValue(node.parameters.tags, itemJson);
      if (Array.isArray(tags)) body.tags = tags;
    } else {
      const parent = resolveValue(node.parameters.parent, itemJson);
      if (parent !== undefined && parent !== null && parent !== "") body.parent = Number(parent);
      const menuOrder = resolveValue(node.parameters.menuOrder, itemJson);
      if (menuOrder !== undefined && menuOrder !== null && menuOrder !== "") body.menu_order = Number(menuOrder);
    }
    const res = await wpRequest(apiBase, "POST", "", body, {}, auth);
    return { json: asObj(res) };
  }

  if (operation === "get") {
    const idParam = wpResource === "posts" ? "postId" : "pageId";
    const id = resolveValue(node.parameters[idParam], itemJson);
    if (id === undefined || id === null || id === "") throw new Error(`WordPress: ${idParam} is required for get`);
    const params: Record<string, string> = {};
    const password = resolveValue(node.parameters.password, itemJson);
    if (password) params.password = String(password);
    const res = await wpRequest(apiBase, "GET", String(id), undefined, params, auth);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const params: Record<string, string> = {};
    const search = resolveValue(node.parameters.search, itemJson);
    if (search) params.search = String(search);
    const after = resolveValue(node.parameters.after, itemJson);
    if (after) params.after = String(after);
    const before = resolveValue(node.parameters.before, itemJson);
    if (before) params.before = String(before);
    const modifiedAfter = resolveValue(node.parameters.modifiedAfter, itemJson);
    if (modifiedAfter) params.modified_after = String(modifiedAfter);
    const modifiedBefore = resolveValue(node.parameters.modifiedBefore, itemJson);
    if (modifiedBefore) params.modified_before = String(modifiedBefore);
    const author = resolveValue(node.parameters.author, itemJson);
    if (author !== undefined && author !== null && author !== "") params.author = String(author);
    const authorExclude = resolveValue(node.parameters.authorExclude, itemJson);
    if (authorExclude !== undefined && authorExclude !== null && authorExclude !== "") params.author_exclude = String(authorExclude);
    const exclude = resolveValue(node.parameters.exclude, itemJson);
    if (exclude !== undefined && exclude !== null && exclude !== "") params.exclude = String(exclude);
    const include = resolveValue(node.parameters.include, itemJson);
    if (include !== undefined && include !== null && include !== "") params.include = String(include);
    const offset = resolveValue(node.parameters.offset, itemJson);
    if (offset !== undefined && offset !== null && offset !== "") params.offset = String(offset);
    const page = resolveValue(node.parameters.page, itemJson);
    if (page !== undefined && page !== null && page !== "") params.page = String(page);
    const perPage = resolveValue(node.parameters.perPage, itemJson);
    if (perPage !== undefined && perPage !== null && perPage !== "") params.per_page = String(perPage);
    const order = resolveValue(node.parameters.order, itemJson);
    if (order) params.order = String(order);
    const orderBy = resolveValue(node.parameters.orderBy, itemJson);
    if (orderBy) params.orderby = String(orderBy);
    const slug = resolveValue(node.parameters.slug, itemJson);
    if (slug) params.slug = String(slug);
    const status = resolveValue(node.parameters.status, itemJson);
    if (status) params.status = String(status);
    if (wpResource === "posts") {
      const categories = resolveValue(node.parameters.categories, itemJson);
      if (categories !== undefined && categories !== null && categories !== "") params.categories = String(categories);
      const categoriesExclude = resolveValue(node.parameters.categoriesExclude, itemJson);
      if (categoriesExclude !== undefined && categoriesExclude !== null && categoriesExclude !== "") params.categories_exclude = String(categoriesExclude);
      const tags = resolveValue(node.parameters.tags, itemJson);
      if (tags !== undefined && tags !== null && tags !== "") params.tags = String(tags);
      const tagsExclude = resolveValue(node.parameters.tagsExclude, itemJson);
      if (tagsExclude !== undefined && tagsExclude !== null && tagsExclude !== "") params.tags_exclude = String(tagsExclude);
      const sticky = resolveValue(node.parameters.sticky, itemJson);
      if (sticky !== undefined && sticky !== null) params.sticky = String(sticky);
    } else {
      const parent = resolveValue(node.parameters.parent, itemJson);
      if (parent !== undefined && parent !== null && parent !== "") params.parent = String(parent);
      const parentExclude = resolveValue(node.parameters.parentExclude, itemJson);
      if (parentExclude !== undefined && parentExclude !== null && parentExclude !== "") params.parent_exclude = String(parentExclude);
    }
    const res = await wpRequest(apiBase, "GET", "", undefined, params, auth);
    const items = Array.isArray(res) ? res : [];
    return items.map((item: unknown) => ({ json: asObj(item) }));
  }

  if (operation === "update") {
    const idParam = wpResource === "posts" ? "postId" : "pageId";
    const id = resolveValue(node.parameters[idParam], itemJson);
    if (id === undefined || id === null || id === "") throw new Error(`WordPress: ${idParam} is required for update`);
    const body: Record<string, unknown> = {};
    const title = resolveValue(node.parameters.title, itemJson);
    if (title !== undefined && title !== null) body.title = String(title);
    const content = resolveValue(node.parameters.content, itemJson);
    if (content !== undefined && content !== null) body.content = String(content);
    const slug = resolveValue(node.parameters.slug, itemJson);
    if (slug !== undefined && slug !== null) body.slug = String(slug);
    const password = resolveValue(node.parameters.password, itemJson);
    if (password !== undefined && password !== null) body.password = String(password);
    const status = resolveValue(node.parameters.status, itemJson);
    if (status !== undefined && status !== null) body.status = String(status);
    const author = resolveValue(node.parameters.author, itemJson);
    if (author !== undefined && author !== null && author !== "") body.author = Number(author);
    const featuredMedia = resolveValue(node.parameters.featuredMedia, itemJson);
    if (featuredMedia !== undefined && featuredMedia !== null && featuredMedia !== "") body.featured_media = Number(featuredMedia);
    const commentStatus = resolveValue(node.parameters.commentStatus, itemJson);
    if (commentStatus !== undefined && commentStatus !== null) body.comment_status = String(commentStatus);
    const pingStatus = resolveValue(node.parameters.pingStatus, itemJson);
    if (pingStatus !== undefined && pingStatus !== null) body.ping_status = String(pingStatus);
    const excerpt = resolveValue(node.parameters.excerpt, itemJson);
    if (excerpt !== undefined && excerpt !== null) body.excerpt = String(excerpt);
    const template = resolveValue(node.parameters.template, itemJson);
    if (template !== undefined && template !== null) body.template = String(template);
    const date = resolveValue(node.parameters.date, itemJson);
    if (date !== undefined && date !== null) body.date = String(date);
    const dateGmt = resolveValue(node.parameters.dateGmt, itemJson);
    if (dateGmt !== undefined && dateGmt !== null) body.date_gmt = String(dateGmt);
    if (wpResource === "posts") {
      const format = resolveValue(node.parameters.format, itemJson);
      if (format !== undefined && format !== null) body.format = String(format);
      const sticky = resolveValue(node.parameters.sticky, itemJson);
      if (sticky !== undefined && sticky !== null) body.sticky = Boolean(sticky);
      const categories = resolveValue(node.parameters.categories, itemJson);
      if (categories !== undefined && categories !== null) body.categories = categories;
      const tags = resolveValue(node.parameters.tags, itemJson);
      if (tags !== undefined && tags !== null) body.tags = tags;
    } else {
      const parent = resolveValue(node.parameters.parent, itemJson);
      if (parent !== undefined && parent !== null && parent !== "") body.parent = Number(parent);
      const menuOrder = resolveValue(node.parameters.menuOrder, itemJson);
      if (menuOrder !== undefined && menuOrder !== null && menuOrder !== "") body.menu_order = Number(menuOrder);
    }
    const res = await wpRequest(apiBase, "POST", String(id), body, {}, auth);
    return { json: asObj(res) };
  }

  throw new Error(`WordPress: unsupported ${wpResource} operation "${operation}"`);
}

async function runUserOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const { baseUrl, auth } = await getCredential(ctx);
  const apiBase = `${baseUrl}/wp-json/wp/v2/users`;

  if (operation === "create") {
    const username = String(resolveValue(node.parameters.username, itemJson) ?? "");
    if (!username) throw new Error("WordPress: username is required for user create");
    const password = String(resolveValue(node.parameters.password, itemJson) ?? "");
    if (!password) throw new Error("WordPress: password is required for user create");
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!email) throw new Error("WordPress: email is required for user create");
    const body: Record<string, unknown> = { username, password, email };
    const name = resolveValue(node.parameters.name, itemJson);
    if (name) body.name = String(name);
    const firstName = resolveValue(node.parameters.firstName, itemJson);
    if (firstName) body.first_name = String(firstName);
    const lastName = resolveValue(node.parameters.lastName, itemJson);
    if (lastName) body.last_name = String(lastName);
    const nickname = resolveValue(node.parameters.nickname, itemJson);
    if (nickname) body.nickname = String(nickname);
    const url = resolveValue(node.parameters.url, itemJson);
    if (url) body.url = String(url);
    const description = resolveValue(node.parameters.description, itemJson);
    if (description) body.description = String(description);
    const slug = resolveValue(node.parameters.slug, itemJson);
    if (slug) body.slug = String(slug);
    const roles = resolveValue(node.parameters.roles, itemJson);
    if (Array.isArray(roles)) body.roles = roles;
    const locale = resolveValue(node.parameters.locale, itemJson);
    if (locale) body.locale = String(locale);
    const res = await wpRequest(apiBase, "POST", "", body, {}, auth);
    return { json: asObj(res) };
  }

  if (operation === "get") {
    const userId = resolveValue(node.parameters.userId, itemJson);
    if (userId === undefined || userId === null || userId === "") throw new Error("WordPress: userId is required for user get");
    const res = await wpRequest(apiBase, "GET", String(userId), undefined, {}, auth);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const params: Record<string, string> = {};
    const search = resolveValue(node.parameters.search, itemJson);
    if (search) params.search = String(search);
    const exclude = resolveValue(node.parameters.exclude, itemJson);
    if (exclude !== undefined && exclude !== null && exclude !== "") params.exclude = String(exclude);
    const include = resolveValue(node.parameters.include, itemJson);
    if (include !== undefined && include !== null && include !== "") params.include = String(include);
    const offset = resolveValue(node.parameters.offset, itemJson);
    if (offset !== undefined && offset !== null && offset !== "") params.offset = String(offset);
    const page = resolveValue(node.parameters.page, itemJson);
    if (page !== undefined && page !== null && page !== "") params.page = String(page);
    const perPage = resolveValue(node.parameters.perPage, itemJson);
    if (perPage !== undefined && perPage !== null && perPage !== "") params.per_page = String(perPage);
    const slug = resolveValue(node.parameters.slug, itemJson);
    if (slug) params.slug = String(slug);
    const order = resolveValue(node.parameters.order, itemJson);
    if (order) params.order = String(order);
    const orderBy = resolveValue(node.parameters.orderBy, itemJson);
    if (orderBy) params.orderby = String(orderBy);
    const roles = resolveValue(node.parameters.roles, itemJson);
    if (roles) params.roles = String(roles);
    const who = resolveValue(node.parameters.who, itemJson);
    if (who) params.who = String(who);
    const res = await wpRequest(apiBase, "GET", "", undefined, params, auth);
    const items = Array.isArray(res) ? res : [];
    return items.map((item: unknown) => ({ json: asObj(item) }));
  }

  if (operation === "update") {
    const userId = resolveValue(node.parameters.userId, itemJson);
    if (userId === undefined || userId === null || userId === "") throw new Error("WordPress: userId is required for user update");
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
    const nickname = resolveValue(node.parameters.nickname, itemJson);
    if (nickname !== undefined && nickname !== null) body.nickname = String(nickname);
    const url = resolveValue(node.parameters.url, itemJson);
    if (url !== undefined && url !== null) body.url = String(url);
    const description = resolveValue(node.parameters.description, itemJson);
    if (description !== undefined && description !== null) body.description = String(description);
    const slug = resolveValue(node.parameters.slug, itemJson);
    if (slug !== undefined && slug !== null) body.slug = String(slug);
    const roles = resolveValue(node.parameters.roles, itemJson);
    if (roles !== undefined && roles !== null) body.roles = roles;
    const locale = resolveValue(node.parameters.locale, itemJson);
    if (locale !== undefined && locale !== null) body.locale = String(locale);
    const res = await wpRequest(apiBase, "POST", String(userId), body, {}, auth);
    return { json: asObj(res) };
  }

  throw new Error(`WordPress: unsupported user operation "${operation}"`);
}

async function wpRequest(
  baseUrl: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
  auth?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = path
    ? `${baseUrl}/${path}${params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : ""}`
    : `${baseUrl}${params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : ""}`;
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
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // keep text
    }
    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = parsed && typeof parsed === "object" ? asObj(parsed as Record<string, unknown>) : {};
      const errMsg = (obj.message as string) ?? (obj.code as string) ?? `Request failed with status code ${response.status}`;
      const err = new Error(errMsg);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed)) return parsed as unknown as Record<string, unknown>;
      return asObj(parsed as Record<string, unknown>);
    }
    return { data: parsed };
  } finally {
    clearTimeout(timer);
  }
}
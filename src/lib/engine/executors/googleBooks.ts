import type { NodeExecutor, ExecutionContext, INodeExecutionData, INode } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveLocator(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return String((resolved as Record<string, unknown>).value ?? "").trim();
  }
  return String(resolved ?? "").trim();
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function buildQuery(params: Record<string, string | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(
    node.parameters.authentication ?? ctx.getParam("authentication", "oAuth2") ?? "oAuth2",
  );
  const credName =
    authentication === "serviceAccount" ? "googleApi" : "googleBooksOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleBooks: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleBooks: ${credName} has no accessToken`);
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const errObj = asObj(parsed);
    const msg =
      (errObj.error as { message?: string } | undefined)?.message ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleBooks: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

export const googleBooksExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "volume");
  const operation = ctx.getParam<string>("operation", "getAll");
  const continueOnFail = ctx.continueOnFail();

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const token = await getAccessToken(ctx, ctx.getNode());

      let result: unknown;

      if (resource === "volume") {
        result = await handleVolume(operation, ctx, item, token);
      } else if (resource === "bookshelf") {
        result = await handleBookshelf(operation, ctx, item, token);
      } else if (resource === "bookshelfVolume") {
        result = await handleBookshelfVolume(operation, ctx, item, token);
      } else {
        throw new Error(
          `Google Books: unsupported resource/operation combination: ${resource}/${operation}`,
        );
      }

      out.push({
        json: result as Record<string, unknown>,
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

async function handleVolume(
  operation: string,
  ctx: ExecutionContext,
  item: INodeExecutionData,
  token: string,
): Promise<unknown> {
  const itemJson = item.json ?? {};

  if (operation === "get") {
    const volumeId = resolveLocator(ctx.node.parameters.volumeId ?? ctx.getParam("volumeId", ""), itemJson);
    if (!volumeId?.trim()) {
      throw new Error("Google Books: volumeId is required");
    }
    const res = await apiRequest("GET", `${GOOGLE_BOOKS_API}/volumes/${volumeId}`, token);
    return res.body;
  }

  if (operation === "getAll") {
    const query = resolveLocator(ctx.node.parameters.searchQuery ?? ctx.getParam("searchQuery", ""), itemJson);
    if (!query?.trim()) {
      throw new Error("Google Books: searchQuery is required");
    }
    const params: Record<string, string> = { q: query };

    const returnAll = ctx.getParam<boolean>("returnAll", false);
    const limit = ctx.getParam<number>("limit", 40);
    if (!returnAll) {
      params.maxResults = String(Math.min(limit, 40));
    }

    const filters = ctx.getParam<Record<string, unknown>>("filters", {});
    if (filters) {
      if (filters.filter) params.filter = String(filters.filter);
      if (filters.langRestrict) params.langRestrict = String(filters.langRestrict);
      if (filters.orderBy) params.orderBy = String(filters.orderBy);
      if (filters.printType) params.printType = String(filters.printType);
      if (filters.projection) params.projection = String(filters.projection);
    }

    const res = await apiRequest("GET", `${GOOGLE_BOOKS_API}/volumes${buildQuery(params)}`, token);
    return res.body;
  }

  throw new Error(`Google Books: unsupported operation ${operation} for volume`);
}

async function handleBookshelf(
  operation: string,
  ctx: ExecutionContext,
  item: INodeExecutionData,
  token: string,
): Promise<unknown> {
  const itemJson = item.json ?? {};
  const myLibrary = ctx.getParam<boolean>("myLibrary", false);

  if (operation === "get") {
    const shelfId = resolveLocator(ctx.node.parameters.shelfId ?? ctx.getParam("shelfId", ""), itemJson);
    if (!shelfId?.trim()) {
      throw new Error("Google Books: shelfId is required");
    }

    if (myLibrary) {
      const res = await apiRequest("GET", `${GOOGLE_BOOKS_API}/mylibrary/bookshelves/${shelfId}`, token);
      return res.body;
    }

    const userId = resolveLocator(ctx.node.parameters.userId ?? ctx.getParam("userId", ""), itemJson);
    if (!userId?.trim()) {
      throw new Error("Google Books: userId is required when myLibrary is false");
    }
    const res = await apiRequest("GET", `${GOOGLE_BOOKS_API}/users/${userId}/bookshelves/${shelfId}`, token);
    return res.body;
  }

  if (operation === "getAll") {
    if (myLibrary) {
      const res = await apiRequest("GET", `${GOOGLE_BOOKS_API}/mylibrary/bookshelves`, token);
      return res.body;
    }

    const userId = resolveLocator(ctx.node.parameters.userId ?? ctx.getParam("userId", ""), itemJson);
    if (!userId?.trim()) {
      throw new Error("Google Books: userId is required when myLibrary is false");
    }
    const res = await apiRequest("GET", `${GOOGLE_BOOKS_API}/users/${userId}/bookshelves`, token);
    return res.body;
  }

  throw new Error(
    `Google Books: unsupported operation ${operation} for bookshelf`,
  );
}

async function handleBookshelfVolume(
  operation: string,
  ctx: ExecutionContext,
  item: INodeExecutionData,
  token: string,
): Promise<unknown> {
  const itemJson = item.json ?? {};
  const shelfId = resolveLocator(ctx.node.parameters.shelfId ?? ctx.getParam("shelfId", ""), itemJson);
  if (!shelfId?.trim()) {
    throw new Error("Google Books: shelfId is required");
  }

  if (operation === "getAll") {
    const myLibrary = ctx.getParam<boolean>("myLibrary", false);
    const returnAll = ctx.getParam<boolean>("returnAll", false);
    const limit = ctx.getParam<number>("limit", 40);
    const params: Record<string, string> = {};
    if (!returnAll) {
      params.maxResults = String(Math.min(limit, 40));
    }
    const qs = buildQuery(params);

    if (myLibrary) {
      const url = `${GOOGLE_BOOKS_API}/mylibrary/bookshelves/${shelfId}/volumes${qs}`;
      const res = await apiRequest("GET", url, token);
      return res.body;
    }

    const userId = resolveLocator(ctx.node.parameters.userId ?? ctx.getParam("userId", ""), itemJson);
    if (!userId?.trim()) {
      throw new Error("Google Books: userId is required when myLibrary is false");
    }
    const url = `${GOOGLE_BOOKS_API}/users/${userId}/bookshelves/${shelfId}/volumes${qs}`;
    const res = await apiRequest("GET", url, token);
    return res.body;
  }

  if (operation === "add") {
    const volumeId = resolveLocator(ctx.node.parameters.volumeId ?? ctx.getParam("volumeId", ""), itemJson);
    if (!volumeId?.trim()) {
      throw new Error("Google Books: volumeId is required");
    }
    const res = await apiRequest(
      "POST",
      `${GOOGLE_BOOKS_API}/mylibrary/bookshelves/${shelfId}/addVolume`,
      token,
      { volumeId },
    );
    return res.body;
  }

  if (operation === "clear") {
    const res = await apiRequest(
      "POST",
      `${GOOGLE_BOOKS_API}/mylibrary/bookshelves/${shelfId}/clearVolumes`,
      token,
      {},
    );
    return res.body;
  }

  if (operation === "move") {
    const volumeId = resolveLocator(ctx.node.parameters.volumeId ?? ctx.getParam("volumeId", ""), itemJson);
    if (!volumeId?.trim()) {
      throw new Error("Google Books: volumeId is required");
    }
    const volumePosition = ctx.getParam<number>("volumePosition", 0);
    const res = await apiRequest(
      "POST",
      `${GOOGLE_BOOKS_API}/mylibrary/bookshelves/${shelfId}/moveVolume`,
      token,
      { volumeId, volumePosition: String(volumePosition) },
    );
    return res.body;
  }

  if (operation === "remove") {
    const volumeId = resolveLocator(ctx.node.parameters.volumeId ?? ctx.getParam("volumeId", ""), itemJson);
    if (!volumeId?.trim()) {
      throw new Error("Google Books: volumeId is required");
    }
    const res = await apiRequest(
      "POST",
      `${GOOGLE_BOOKS_API}/mylibrary/bookshelves/${shelfId}/removeVolume`,
      token,
      { volumeId },
    );
    return res.body;
  }

  throw new Error(
    `Google Books: unsupported operation ${operation} for bookshelf volume`,
  );
}

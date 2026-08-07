import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { sdkHttpRequest, requireCredential, ensureItems, withPairedItem } from "@/sdk";

type WekanCredential = {
  url: string;
  username: string;
  password: string;
};

async function getBaseUrl(ctx: Parameters<NodeExecutor>[0]): Promise<string> {
  const cred = await requireCredential(ctx, "wekanApi");
  const { url } = cred as unknown as WekanCredential;
  return url.replace(/\/+$/, "");
}

async function getAuth(ctx: Parameters<NodeExecutor>[0]): Promise<{ username: string; password: string }> {
  const cred = await requireCredential(ctx, "wekanApi");
  const { username, password } = cred as unknown as WekanCredential;
  return { username, password };
}

function buildHeaders(auth: { username: string; password: string }): Record<string, string> {
  const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
  return {
    Authorization: `Basic ${encoded}`,
    "Content-Type": "application/json",
  };
}

export const wekanToolExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const resource = ctx.getParam<string>("resource", "board");
  const operation = ctx.getParam<string>("operation", "getAll");

  let baseUrl: string;
  let auth: { username: string; password: string };
  try {
    baseUrl = await getBaseUrl(ctx);
    auth = await getAuth(ctx);
  } catch (err) {
    if (ctx.continueOnFail()) {
      return [items.map((item, idx) => withPairedItem({ json: { ...(item.json ?? {}), error: String(err) } }, idx))];
    }
    throw err;
  }

  const headers = buildHeaders(auth);
  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const json = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: i, input: 0 };

    try {
      const results = await executeOperation(resource, operation, ctx, baseUrl, headers, json);
      const entities = Array.isArray(results) ? results : [results];
      for (const entity of entities) {
        out.push({ json: { ...json, ...entity }, pairedItem });
      }
    } catch (err) {
      if (ctx.continueOnFail()) {
        out.push({ json: { error: String(err), ...json }, pairedItem });
      } else {
        throw err;
      }
    }
  }

  return [out.map((o, idx) => withPairedItem(o, idx))];
};

async function executeOperation(
  resource: string,
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  headers: Record<string, string>,
  json: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  switch (resource) {
    case "board":
      return executeBoardOp(operation, ctx, baseUrl, headers, json);
    case "card":
      return executeCardOp(operation, ctx, baseUrl, headers, json);
    case "cardComment":
      return executeCardCommentOp(operation, ctx, baseUrl, headers, json);
    case "checklist":
      return executeChecklistOp(operation, ctx, baseUrl, headers, json);
    case "checklistItem":
      return executeChecklistItemOp(operation, ctx, baseUrl, headers, json);
    case "list":
      return executeListOp(operation, ctx, baseUrl, headers, json);
    default:
      throw new Error(`Unknown resource: ${resource}`);
  }
}

async function sdkRequestOk(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ body: unknown; status: number }> {
  const res = await sdkHttpRequest({ url, method, headers, body });
  if (res.status < 200 || res.status >= 300) {
    const msg = typeof res.body === "object" && res.body !== null
      ? JSON.stringify(res.body)
      : String(res.body ?? "");
    throw new Error(`Wekan API error (${res.status}): ${msg}`);
  }
  return res;
}

async function executeBoardOp(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  headers: Record<string, string>,
  json: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  switch (operation) {
    case "create": {
      const title = ctx.getParam<string>("title", "");
      const visibility = ctx.getParam<boolean>("visibility", false);
      const res = await sdkRequestOk(`${baseUrl}/api/boards`, "POST", headers, JSON.stringify({ title, visibility }));
      return [res.body as Record<string, unknown>];
    }
    case "delete": {
      const boardId = ctx.getParam<string>("boardId", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}`, "DELETE", headers);
      return [(res.body ?? { _id: boardId }) as Record<string, unknown>];
    }
    case "get": {
      const boardId = ctx.getParam<string>("boardId", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}`, "GET", headers);
      return [res.body as Record<string, unknown>];
    }
    case "getAll": {
      const res = await sdkRequestOk(`${baseUrl}/api/boards`, "GET", headers);
      const data = res.body;
      if (Array.isArray(data)) return data as Record<string, unknown>[];
      return [data as Record<string, unknown>];
    }
    default:
      throw new Error(`Unknown board operation: ${operation}`);
  }
}

async function executeCardOp(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  headers: Record<string, string>,
  json: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const boardId = ctx.getParam<string>("boardId", "");
  switch (operation) {
    case "create": {
      const listId = ctx.getParam<string>("listId", "");
      const title = ctx.getParam<string>("title", "");
      const description = ctx.getParam<string>("description", undefined);
      const body: Record<string, unknown> = { title, listId };
      if (description !== undefined) body.description = description;
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/lists/${listId}/cards`, "POST", headers, JSON.stringify(body));
      return [res.body as Record<string, unknown>];
    }
    case "delete": {
      const cardId = ctx.getParam<string>("cardId", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}`, "DELETE", headers);
      return [(res.body ?? { _id: cardId }) as Record<string, unknown>];
    }
    case "get": {
      const cardId = ctx.getParam<string>("cardId", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}`, "GET", headers);
      return [res.body as Record<string, unknown>];
    }
    case "getAll": {
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards`, "GET", headers);
      const data = res.body;
      if (Array.isArray(data)) return data as Record<string, unknown>[];
      return [data as Record<string, unknown>];
    }
    case "update": {
      const cardId = ctx.getParam<string>("cardId", "");
      const title = ctx.getParam<string>("title", undefined);
      const description = ctx.getParam<string>("description", undefined);
      const body: Record<string, unknown> = {};
      if (title !== undefined) body.title = title;
      if (description !== undefined) body.description = description;
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}`, "PUT", headers, JSON.stringify(body));
      return [res.body as Record<string, unknown>];
    }
    default:
      throw new Error(`Unknown card operation: ${operation}`);
  }
}

async function executeCardCommentOp(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  headers: Record<string, string>,
  json: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const boardId = ctx.getParam<string>("boardId", "");
  const cardId = ctx.getParam<string>("cardId", "");
  switch (operation) {
    case "create": {
      const authorId = ctx.getParam<string>("authorId", "");
      const comment = ctx.getParam<string>("comment", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}/comments`, "POST", headers, JSON.stringify({ authorId, comment }));
      return [res.body as Record<string, unknown>];
    }
    case "delete": {
      const commentId = ctx.getParam<string>("commentId", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}/comments/${commentId}`, "DELETE", headers);
      return [(res.body ?? { _id: commentId }) as Record<string, unknown>];
    }
    case "get": {
      const commentId = ctx.getParam<string>("commentId", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}/comments/${commentId}`, "GET", headers);
      return [res.body as Record<string, unknown>];
    }
    case "getAll": {
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}/comments`, "GET", headers);
      const data = res.body;
      if (Array.isArray(data)) return data as Record<string, unknown>[];
      return [data as Record<string, unknown>];
    }
    default:
      throw new Error(`Unknown cardComment operation: ${operation}`);
  }
}

async function executeChecklistOp(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  headers: Record<string, string>,
  json: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const boardId = ctx.getParam<string>("boardId", "");
  const cardId = ctx.getParam<string>("cardId", "");
  switch (operation) {
    case "create": {
      const title = ctx.getParam<string>("title", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}/checklists`, "POST", headers, JSON.stringify({ title }));
      return [res.body as Record<string, unknown>];
    }
    case "delete": {
      const checklistId = ctx.getParam<string>("checklistId", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}/checklists/${checklistId}`, "DELETE", headers);
      return [(res.body ?? { _id: checklistId }) as Record<string, unknown>];
    }
    case "get": {
      const checklistId = ctx.getParam<string>("checklistId", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}/checklists/${checklistId}`, "GET", headers);
      return [res.body as Record<string, unknown>];
    }
    case "getAll": {
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}/checklists`, "GET", headers);
      const data = res.body;
      if (Array.isArray(data)) return data as Record<string, unknown>[];
      return [data as Record<string, unknown>];
    }
    default:
      throw new Error(`Unknown checklist operation: ${operation}`);
  }
}

async function executeChecklistItemOp(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  headers: Record<string, string>,
  json: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const boardId = ctx.getParam<string>("boardId", "");
  const cardId = ctx.getParam<string>("cardId", "");
  const checklistId = ctx.getParam<string>("checklistId", "");
  switch (operation) {
    case "delete": {
      const itemId = ctx.getParam<string>("checklistItemId", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}/checklists/${checklistId}/items/${itemId}`, "DELETE", headers);
      return [(res.body ?? { _id: itemId }) as Record<string, unknown>];
    }
    case "get": {
      const itemId = ctx.getParam<string>("checklistItemId", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}/checklists/${checklistId}/items/${itemId}`, "GET", headers);
      return [res.body as Record<string, unknown>];
    }
    case "update": {
      const itemId = ctx.getParam<string>("checklistItemId", "");
      const title = ctx.getParam<string>("title", undefined);
      const isFinished = ctx.getParam<boolean>("isFinished", undefined);
      const body: Record<string, unknown> = {};
      if (title !== undefined) body.title = title;
      if (isFinished !== undefined) body.isFinished = isFinished;
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/cards/${cardId}/checklists/${checklistId}/items/${itemId}`, "PUT", headers, JSON.stringify(body));
      return [res.body as Record<string, unknown>];
    }
    default:
      throw new Error(`Unknown checklistItem operation: ${operation}`);
  }
}

async function executeListOp(
  operation: string,
  ctx: Parameters<NodeExecutor>[0],
  baseUrl: string,
  headers: Record<string, string>,
  json: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const boardId = ctx.getParam<string>("boardId", "");
  switch (operation) {
    case "create": {
      const title = ctx.getParam<string>("title", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/lists`, "POST", headers, JSON.stringify({ title }));
      return [res.body as Record<string, unknown>];
    }
    case "delete": {
      const listId = ctx.getParam<string>("listId", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/lists/${listId}`, "DELETE", headers);
      return [(res.body ?? { _id: listId }) as Record<string, unknown>];
    }
    case "get": {
      const listId = ctx.getParam<string>("listId", "");
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/lists/${listId}`, "GET", headers);
      return [res.body as Record<string, unknown>];
    }
    case "getAll": {
      const res = await sdkRequestOk(`${baseUrl}/api/boards/${boardId}/lists`, "GET", headers);
      const data = res.body;
      if (Array.isArray(data)) return data as Record<string, unknown>[];
      return [data as Record<string, unknown>];
    }
    default:
      throw new Error(`Unknown list operation: ${operation}`);
  }
}

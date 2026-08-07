import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const REGION_BASES: Record<string, string> = {
  USDC: "https://api.iterable.com",
  EDC: "https://api.eu.iterable.com",
};

interface IterableEvent {
  eventName: string;
  email?: string;
  userId?: string;
  id?: string;
  campaignId?: string;
  templateId?: string;
  createdAt?: number;
  dataFields?: Record<string, string>;
}

async function getApiBase(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("iterableApi");
  if (!cred) throw new Error("Iterable: iterableApi credential is required");
  const region = String((cred as Record<string, unknown>).region ?? "USDC");
  return REGION_BASES[region] ?? REGION_BASES.USDC;
}

async function getApiKey(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("iterableApi");
  if (!cred) throw new Error("Iterable: iterableApi credential is required");
  const apiKey = String((cred as Record<string, unknown>).apiKey ?? "");
  if (!apiKey) throw new Error("Iterable: apiKey is required in the iterableApi credential");
  return apiKey;
}

async function apiRequest(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${baseUrl}/api${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    const obj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    if (response.status === 404) {
      const err = new Error("User not found");
      (err as Record<string, unknown>).httpCode = 404;
      (err as Record<string, unknown>).status = 404;
      throw err;
    }
    if (response.status < 200 || response.status >= 300) {
      const msg = (obj.message as string) ?? `Iterable API error: ${response.status}`;
      const err = new Error(msg);
      (err as Record<string, unknown>).httpCode = response.status;
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return obj;
  } finally {
    clearTimeout(timer);
  }
}

function collectDataFields(
  ui: unknown,
): Record<string, string> | undefined {
  if (!ui || typeof ui !== "object") return undefined;
  const u = ui as Record<string, unknown>;
  const values = u.values as Array<Record<string, string>> | undefined;
  if (!values || !Array.isArray(values)) return undefined;
  const fields: Record<string, string> = {};
  for (const entry of values) {
    if (entry.key) fields[entry.key] = entry.value ?? "";
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

// ---------------------------------------------------------------------------
// Event operations
// ---------------------------------------------------------------------------

async function runEventTrack(
  node: INode,
  items: INodeExecutionData[],
  apiBase: string,
  apiKey: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const events: IterableEvent[] = [];

  for (const item of items) {
    const itemJson = item.json ?? {};
    const eventName = String(node.parameters.name ?? "");
    if (!eventName) throw new Error("Iterable: name is required for event track");

    const af = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
    const ev: IterableEvent = { eventName };

    if (af.email) ev.email = String(af.email);
    if (af.userId) ev.userId = String(af.userId);
    if (af.id) ev.id = String(af.id);
    if (af.campaignId) ev.campaignId = String(af.campaignId);
    if (af.templateId) ev.templateId = String(af.templateId);
    if (af.createdAt) {
      const d = new Date(String(af.createdAt));
      ev.createdAt = Math.floor(d.getTime() / 1000);
    }
    const dataFields = collectDataFields(af.dataFieldsUi);
    if (dataFields) ev.dataFields = dataFields;

    if (!ev.email && !ev.userId) {
      throw new Error("Iterable: either email or userId must be provided in additionalFields for event track");
    }
    events.push(ev);
  }

  const res = await apiRequest(apiBase, apiKey, "POST", "/events/trackBulk", { events });
  const itemJson = items[0]?.json ?? {};
  return [{ json: { ...itemJson, ...res } }];
}

// ---------------------------------------------------------------------------
// User operations
// ---------------------------------------------------------------------------

async function runUserUpsert(
  node: INode,
  items: INodeExecutionData[],
  apiBase: string,
  apiKey: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const identifier = String(node.parameters.identifier ?? "email");
      const value = String(node.parameters.value ?? "");

      if (!value) throw new Error("Iterable: value is required for user upsert");

      const af = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
      const body: Record<string, unknown> = { preferUserId: true };

      if (identifier === "email") {
        body.email = value;
      } else {
        body.userId = value;
      }

      const dataFields = collectDataFields(af.dataFieldsUi);
      if (dataFields) body.dataFields = dataFields;
      if (af.mergeNestedObjects !== undefined) {
        body.mergeNestedObjects = af.mergeNestedObjects;
      }

      const res = await apiRequest(apiBase, apiKey, "POST", "/users/update", body);
      const code = res.code as string | undefined;
      if (code && code !== "Success") {
        throw new Error(`Iterable: user upsert failed with code "${code}"`);
      }
      out.push({ json: { ...itemJson, ...res }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return out;
}

async function runUserDelete(
  node: INode,
  items: INodeExecutionData[],
  apiBase: string,
  apiKey: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const by = String(node.parameters.by ?? "email");
      let path: string;
      if (by === "email") {
        const email = String(node.parameters.email ?? "");
        if (!email) throw new Error("Iterable: email is required for user delete by email");
        path = `/users/${encodeURIComponent(email)}`;
      } else {
        const userId = String(node.parameters.userId ?? "");
        if (!userId) throw new Error("Iterable: userId is required for user delete by userId");
        path = `/users/byUserId/${encodeURIComponent(userId)}`;
      }
      const res = await apiRequest(apiBase, apiKey, "DELETE", path);
      const code = res.code as string | undefined;
      if (code && code !== "Success") {
        throw new Error(`Iterable: user delete failed with code "${code}"`);
      }
      out.push({ json: { ...itemJson, ...res }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return out;
}

async function runUserGet(
  node: INode,
  items: INodeExecutionData[],
  apiBase: string,
  apiKey: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const out: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const by = String(node.parameters.by ?? "email");
      let path: string;
      if (by === "email") {
        const email = String(node.parameters.email ?? "");
        if (!email) throw new Error("Iterable: email is required for user get by email");
        path = `/users/getByEmail?email=${encodeURIComponent(email)}`;
      } else {
        const userId = String(node.parameters.userId ?? "");
        if (!userId) throw new Error("Iterable: userId is required for user get by userId");
        path = `/users/byUserId/${encodeURIComponent(userId)}`;
      }
      const res = await apiRequest(apiBase, apiKey, "GET", path);
      const unwrapped = (res.user ?? res) as Record<string, unknown>;
      out.push({ json: { ...itemJson, ...unwrapped }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// User List operations
// ---------------------------------------------------------------------------

async function runUserListAdd(
  node: INode,
  items: INodeExecutionData[],
  apiBase: string,
  apiKey: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const listId = node.parameters.listId;
  const identifier = String(node.parameters.identifier ?? "email");
  const subscribers: Array<Record<string, string>> = [];

  for (const item of items) {
    const itemJson = item.json ?? {};
    const value = String(node.parameters.value ?? "");
    const resolved = value || (itemJson.email as string) || "";
    const entry: Record<string, string> = {};
    entry[identifier] = resolved;
    subscribers.push(entry);
  }

  const body: Record<string, unknown> = { listId, subscribers };
  const res = await apiRequest(apiBase, apiKey, "POST", "/lists/subscribe", body);
  const firstJson = items[0]?.json ?? {};
  return [{ json: { ...firstJson, ...res } }];
}

async function runUserListRemove(
  node: INode,
  items: INodeExecutionData[],
  apiBase: string,
  apiKey: string,
  continueOnFail: boolean,
): Promise<INodeExecutionData[]> {
  const listId = node.parameters.listId;
  const identifier = String(node.parameters.identifier ?? "email");
  const subscribers: Array<Record<string, string>> = [];

  for (const item of items) {
    const itemJson = item.json ?? {};
    const value = String(node.parameters.value ?? "");
    const resolved = value || (itemJson.email as string) || "";
    const entry: Record<string, string> = {};
    entry[identifier] = resolved;
    subscribers.push(entry);
  }

  const body: Record<string, unknown> = { listId, subscribers };
  const af = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  if (af.campaignId) body.campaignId = Number(af.campaignId);
  if (af.channelUnsubscribe !== undefined) body.channelUnsubscribe = af.channelUnsubscribe;

  const res = await apiRequest(apiBase, apiKey, "POST", "/lists/unsubscribe", body);
  const firstJson = items[0]?.json ?? {};
  return [{ json: { ...firstJson, ...res } }];
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export const iterableExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const resource = String(node.parameters.resource ?? "user");
  const operation = String(node.parameters.operation ?? "upsert");
  const continueOnFail = ctx.continueOnFail();

  const apiBase = await getApiBase(ctx);
  const apiKey = await getApiKey(ctx);

  let out: INodeExecutionData[];

  switch (resource) {
    case "event":
      if (operation === "track") {
        out = await runEventTrack(node, items, apiBase, apiKey, continueOnFail);
      } else {
        throw new Error(`Iterable: unsupported event operation "${operation}"`);
      }
      break;

    case "user":
      switch (operation) {
        case "upsert":
          out = await runUserUpsert(node, items, apiBase, apiKey, continueOnFail);
          break;
        case "delete":
          out = await runUserDelete(node, items, apiBase, apiKey, continueOnFail);
          break;
        case "get":
          out = await runUserGet(node, items, apiBase, apiKey, continueOnFail);
          break;
        default:
          throw new Error(`Iterable: unsupported user operation "${operation}"`);
      }
      break;

    case "userList":
      switch (operation) {
        case "add":
          out = await runUserListAdd(node, items, apiBase, apiKey, continueOnFail);
          break;
        case "remove":
          out = await runUserListRemove(node, items, apiBase, apiKey, continueOnFail);
          break;
        default:
          throw new Error(`Iterable: unsupported userList operation "${operation}"`);
      }
      break;

    default:
      throw new Error(`Iterable: unsupported resource "${resource}"`);
  }

  return [out];
};

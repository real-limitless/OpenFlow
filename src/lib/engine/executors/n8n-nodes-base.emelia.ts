import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateOnItem } from "@/sdk";
import { requireCredential } from "@/sdk";

const API_BASE = "https://api.emelia.io/v1";

function resolveString(raw: unknown, itemJson: Record<string, unknown>): string {
  if (typeof raw !== "string") return String(raw ?? "");
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateOnItem(raw, itemJson);
    return String(result ?? "");
  }
  return raw;
}

function resolveCollection(
  raw: unknown,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && (v.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(v))) {
      out[k] = evaluateOnItem(v, itemJson);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function request(
  method: string,
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (res.status === 429) {
      throw new Error("Emelia: rate limited (HTTP 429)");
    }
    if (res.status < 200 || res.status >= 300) {
      const msg =
        parsed && typeof parsed === "object"
          ? String((parsed as Record<string, unknown>).message ?? "")
          : "";
      throw new Error(`Emelia: ${msg || `HTTP ${res.status}`}`);
    }
    return (parsed as Record<string, unknown>) ?? {};
  } finally {
    clearTimeout(timer);
  }
}

async function campaignCreate(
  apiKey: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  if (params.campaignName) body.name = params.campaignName;
  return request("POST", "/campaigns", apiKey, body);
}

async function campaignGet(
  apiKey: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = String(params.campaignId ?? "");
  if (!id) throw new Error("Emelia: campaignId is required");
  return request("GET", `/campaigns/${id}`, apiKey);
}

async function campaignGetAll(
  apiKey: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(params.returnAll ?? false);
  const limit = Number(params.limit ?? 0);
  const results: Record<string, unknown>[] = [];
  let offset = 0;
  const pageSize = returnAll ? 100 : Math.max(1, Math.min(Math.floor(limit) || 10, 100));
  while (true) {
    const qs = `?offset=${offset}&limit=${pageSize}`;
    const data = await request("GET", `/campaigns${qs}`, apiKey);
    const items = (data.data as Record<string, unknown>[]) ?? data.campaigns ?? [];
    for (const item of items) results.push(item);
    if (items.length < pageSize) break;
    offset += items.length;
    if (!returnAll && results.length >= limit) break;
  }
  if (!returnAll && results.length > limit) {
    return results.slice(0, limit);
  }
  return results;
}

async function campaignPause(
  apiKey: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = String(params.campaignId ?? "");
  if (!id) throw new Error("Emelia: campaignId is required");
  return request("POST", `/campaigns/${id}/pause`, apiKey);
}

async function campaignStart(
  apiKey: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = String(params.campaignId ?? "");
  if (!id) throw new Error("Emelia: campaignId is required");
  return request("POST", `/campaigns/${id}/start`, apiKey);
}

async function campaignAddContact(
  apiKey: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const campaignId = String(params.campaignId ?? "");
  if (!campaignId) throw new Error("Emelia: campaignId is required for addContact");
  const email = resolveString(params.contactEmail, itemJson);
  if (!email) throw new Error("Emelia: contactEmail is required for addContact");
  const additionalFields = resolveCollection(params.additionalFields, itemJson);
  const body: Record<string, unknown> = { email, ...additionalFields };
  return request("POST", `/campaigns/${campaignId}/contacts`, apiKey, body);
}

async function campaignDuplicate(
  apiKey: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = String(params.campaignId ?? "");
  if (!id) throw new Error("Emelia: campaignId is required for duplicate");
  const body: Record<string, unknown> = {};
  if (params.campaignName) body.name = params.campaignName;
  const options = (params.options ?? {}) as Record<string, unknown>;
  if (options.copyContacts !== undefined) body.copy_contacts = Boolean(options.copyContacts);
  if (options.copyProvider !== undefined) body.copy_provider = Boolean(options.copyProvider);
  if (options.copyMails !== undefined) body.copy_mails = Boolean(options.copyMails);
  if (options.copySettings !== undefined) body.copy_settings = Boolean(options.copySettings);
  return request("POST", `/campaigns/${id}/duplicate`, apiKey, body);
}

async function contactListAdd(
  apiKey: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const listId = String(params.contactListId ?? "");
  if (!listId) throw new Error("Emelia: contactListId is required for add");
  const email = resolveString(params.contactEmail, itemJson);
  if (!email) throw new Error("Emelia: contactEmail is required for add");
  const additionalFields = resolveCollection(params.additionalFields, itemJson);
  const body: Record<string, unknown> = { email, ...additionalFields };
  return request("POST", `/contact-lists/${listId}/contacts`, apiKey, body);
}

async function contactListGetAll(
  apiKey: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(params.returnAll ?? false);
  const limit = Number(params.limit ?? 0);
  const results: Record<string, unknown>[] = [];
  let offset = 0;
  const pageSize = returnAll ? 100 : Math.max(1, Math.min(Math.floor(limit) || 10, 100));
  while (true) {
    const qs = `?offset=${offset}&limit=${pageSize}`;
    const data = await request("GET", `/contact-lists${qs}`, apiKey);
    const items = (data.data as Record<string, unknown>[]) ?? data.lists ?? [];
    for (const item of items) results.push(item);
    if (items.length < pageSize) break;
    offset += items.length;
    if (!returnAll && results.length >= limit) break;
  }
  if (!returnAll && results.length > limit) {
    return results.slice(0, limit);
  }
  return results;
}

export const emeliaExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "campaign");
  const operation = String(node.parameters.operation ?? "");
  const continueOnFail = ctx.continueOnFail();

  const cred = await requireCredential(ctx, "emeliaApi");
  const apiKey = String(cred.apiKey ?? "");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: unknown;
      if (resource === "campaign") {
        if (operation === "create") {
          result = await campaignCreate(apiKey, node.parameters);
        } else if (operation === "get") {
          result = await campaignGet(apiKey, node.parameters);
        } else if (operation === "getAll") {
          result = await campaignGetAll(apiKey, node.parameters);
        } else if (operation === "pause") {
          result = await campaignPause(apiKey, node.parameters);
        } else if (operation === "start") {
          result = await campaignStart(apiKey, node.parameters);
        } else if (operation === "addContact") {
          result = await campaignAddContact(apiKey, node.parameters, itemJson);
        } else if (operation === "duplicate") {
          result = await campaignDuplicate(apiKey, node.parameters);
        } else {
          throw new Error(`Emelia: unsupported campaign operation "${operation}"`);
        }
      } else if (resource === "contactList") {
        if (operation === "add") {
          result = await contactListAdd(apiKey, node.parameters, itemJson);
        } else if (operation === "getAll") {
          result = await contactListGetAll(apiKey, node.parameters);
        } else {
          throw new Error(`Emelia: unsupported contactList operation "${operation}"`);
        }
      } else {
        throw new Error(`Emelia: unsupported resource "${resource}"`);
      }

      if (Array.isArray(result)) {
        for (const r of result) {
          out.push({ json: r, pairedItem });
        }
      } else {
        out.push({ json: result as Record<string, unknown>, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.egoiapp.com";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

interface OpResult {
  json: Record<string, unknown>;
}

export const egoiExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "contact");
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
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getApiKey(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("egoiApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("E-goi: API key credential is not configured");
  }
  return apiKey;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  if (resource !== "contact") {
    throw new Error(`E-goi: unsupported resource "${resource}"`);
  }
  return runContactOperation(ctx, node, operation, itemJson);
}

async function runContactOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  const apiKey = await getApiKey(ctx);
  const listId = Number(resolveValue(node.parameters.listId, itemJson));
  if (!listId) throw new Error("E-goi: listId is required");

  if (operation === "create") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!email) throw new Error("E-goi: email is required for contact create");

    const body: Record<string, unknown> = { email };

    const optionsRaw = node.parameters.options as Record<string, unknown> | undefined;
    if (optionsRaw) {
      if (optionsRaw.status) body.status = String(optionsRaw.status);
      if (optionsRaw.firstName) body.first_name = String(resolveValue(optionsRaw.firstName, itemJson));
      if (optionsRaw.lastName) body.last_name = String(resolveValue(optionsRaw.lastName, itemJson));
      if (optionsRaw.birthDate) body.birth_date = String(resolveValue(optionsRaw.birthDate, itemJson));
      if (optionsRaw.phone) body.phone = String(resolveValue(optionsRaw.phone, itemJson));
      if (optionsRaw.phoneIndicative) body.phone_indicative = String(resolveValue(optionsRaw.phoneIndicative, itemJson));
      if (optionsRaw.cellphone) body.cellphone = String(resolveValue(optionsRaw.cellphone, itemJson));
      if (optionsRaw.cellphoneIndicative) body.cellphone_indicative = String(resolveValue(optionsRaw.cellphoneIndicative, itemJson));
      if (optionsRaw.subscribeDate) body.subscribe_date = String(resolveValue(optionsRaw.subscribeDate, itemJson));
      if (optionsRaw.confirmationDate) body.confirmation_date = String(resolveValue(optionsRaw.confirmationDate, itemJson));
    }

    const extraFieldsRaw = node.parameters.extraFields as Record<string, unknown> | undefined;
    if (extraFieldsRaw) {
      const values = extraFieldsRaw.values as Array<Record<string, string>> | undefined;
      if (values && values.length > 0) {
        const extra: Record<string, string> = {};
        for (const entry of values) {
          const k = String(resolveValue(entry.fieldName, itemJson) ?? "");
          const v = String(resolveValue(entry.value, itemJson) ?? "");
          if (k) extra[k] = v;
        }
        if (Object.keys(extra).length > 0) body.extra_fields = extra;
      }
    }

    const tagIds = node.parameters.tagIds;
    if (tagIds) {
      const ids = typeof tagIds === "string"
        ? tagIds.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n))
        : Array.isArray(tagIds) ? tagIds : [];
      if (ids.length > 0) body.tag_ids = ids;
    }

    const res = await egoiRequest(apiKey, "POST", `/lists/${listId}/contacts`, body);
    return { json: res as Record<string, unknown> };
  }

  if (operation === "get") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!email) throw new Error("E-goi: email is required for contact get");

    const res = await egoiRequest(apiKey, "GET", `/lists/${listId}/contacts/${encodeURIComponent(email)}`);
    return { json: res as Record<string, unknown> };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);

    const results = await egoiRequestAll(apiKey, listId, returnAll, limit);
    return results.map((r) => ({ json: r }));
  }

  if (operation === "update") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!email) throw new Error("E-goi: email is required for contact update");

    const body: Record<string, unknown> = {};

    const updateAction = String(node.parameters.updateAction ?? "");
    if (updateAction) body.update_action = updateAction;

    const optionsRaw = node.parameters.options as Record<string, unknown> | undefined;
    if (optionsRaw) {
      if (optionsRaw.status) body.status = String(optionsRaw.status);
      if (optionsRaw.firstName) body.first_name = String(resolveValue(optionsRaw.firstName, itemJson));
      if (optionsRaw.lastName) body.last_name = String(resolveValue(optionsRaw.lastName, itemJson));
      if (optionsRaw.birthDate) body.birth_date = String(resolveValue(optionsRaw.birthDate, itemJson));
      if (optionsRaw.phone) body.phone = String(resolveValue(optionsRaw.phone, itemJson));
      if (optionsRaw.phoneIndicative) body.phone_indicative = String(resolveValue(optionsRaw.phoneIndicative, itemJson));
      if (optionsRaw.cellphone) body.cellphone = String(resolveValue(optionsRaw.cellphone, itemJson));
      if (optionsRaw.cellphoneIndicative) body.cellphone_indicative = String(resolveValue(optionsRaw.cellphoneIndicative, itemJson));
      if (optionsRaw.unsubscribeDate) body.unsubscribe_date = String(resolveValue(optionsRaw.unsubscribeDate, itemJson));
    }

    const extraFieldsRaw = node.parameters.extraFields as Record<string, unknown> | undefined;
    if (extraFieldsRaw) {
      const values = extraFieldsRaw.values as Array<Record<string, string>> | undefined;
      if (values && values.length > 0) {
        const extra: Record<string, string> = {};
        for (const entry of values) {
          const k = String(resolveValue(entry.fieldName, itemJson) ?? "");
          const v = String(resolveValue(entry.value, itemJson) ?? "");
          if (k) extra[k] = v;
        }
        if (Object.keys(extra).length > 0) body.extra_fields = extra;
      }
    }

    const tagIds = node.parameters.tagIds;
    if (tagIds) {
      const ids = typeof tagIds === "string"
        ? tagIds.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n))
        : Array.isArray(tagIds) ? tagIds : [];
      if (ids.length > 0) body.tag_ids = ids;
    }

    const res = await egoiRequest(apiKey, "PUT", `/lists/${listId}/contacts/${encodeURIComponent(email)}`, body);
    return { json: res as Record<string, unknown> };
  }

  throw new Error(`E-goi: unsupported contact operation "${operation}"`);
}

async function egoiRequest(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        "Api-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    if (response.status === 204) return null;
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = parsed as Record<string, unknown> | null;
      const errMsg = obj?.message ?? obj?.error ?? `HTTP ${response.status}`;
      throw new Error(String(errMsg));
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith("E-goi") || err.message.includes("HTTP"))) {
      throw err;
    }
    if (err instanceof Error) {
      throw new Error(`E-goi request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function egoiRequestAll(
  apiKey: string,
  listId: number,
  returnAll: boolean,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let page = 0;
  const pageSize = returnAll ? 100 : Math.min(limit, 100);

  do {
    const qs = new URLSearchParams();
    qs.set("offset", String(page * pageSize));
    qs.set("limit", String(pageSize));
    const url = `/lists/${listId}/contacts?${qs.toString()}`;
    const res = (await egoiRequest(apiKey, "GET", url)) as Record<string, unknown> | null;
    if (!res) break;
    const items = (res.contacts ?? []) as Record<string, unknown>[];
    results.push(...items);
    page++;

    if (items.length < pageSize) break;
  } while (returnAll);

  if (!returnAll && limit > 0) {
    return results.slice(0, limit);
  }
  return results;
}

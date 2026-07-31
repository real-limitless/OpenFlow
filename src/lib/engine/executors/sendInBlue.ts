import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.brevo.com/v3";

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

export const sendInBlueExecutor: NodeExecutor = async (ctx, node) => {
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
  const cred = await ctx.getCredential("sendInBlueApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("Brevo: sendInBlueApi credential is not configured");
  }
  return apiKey;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (resource === "contact") {
    return runContactOperation(ctx, node, operation, itemJson);
  }
  if (resource === "attribute") {
    return runAttributeOperation(ctx, node, operation, itemJson);
  }
  if (resource === "email") {
    return runEmailOperation(ctx, node, operation, itemJson);
  }
  if (resource === "sender") {
    return runSenderOperation(ctx, node, operation, itemJson);
  }
  throw new Error(`Brevo: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

async function runContactOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const apiKey = await getApiKey(ctx);

  if (operation === "create" || operation === "upsert") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!email) throw new Error("Brevo: email is required for contact create/upsert");

    const body: Record<string, unknown> = { email };

    const attributesRaw = node.parameters.attributes as Record<string, unknown> | undefined;
    if (attributesRaw) {
      const values = (attributesRaw.attributesValues as Record<string, unknown> | undefined)?.attributes as Array<Record<string, string>> | undefined;
      if (values && values.length > 0) {
        const attrs: Record<string, string> = {};
        for (const entry of values) {
          const k = String(resolveValue(entry.fieldName, itemJson) ?? "");
          const v = String(resolveValue(entry.fieldValue, itemJson) ?? "");
          if (k) attrs[k] = v;
        }
        if (Object.keys(attrs).length > 0) body.attributes = attrs;
      }
    }

    const listIds = resolveValue(node.parameters.listIds, itemJson);
    if (listIds) {
      const ids = typeof listIds === "string" ? listIds.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n)) : Array.isArray(listIds) ? listIds : [];
      if (ids.length > 0) body.listIds = ids;
    }

    if (operation === "upsert") {
      const updateEnabled = Boolean(resolveValue(node.parameters.updateEnabled, itemJson));
      if (updateEnabled) body.updateEnabled = true;
    }

    const res = await brevoRequest(apiKey, "POST", "/contacts", body);
    return { json: asObj(res) };
  }

  if (operation === "get") {
    const identifier = String(resolveValue(node.parameters.identifier, itemJson) ?? "");
    if (!identifier) throw new Error("Brevo: identifier is required for contact get");
    const res = await brevoRequest(apiKey, "GET", `/contacts/${encodeURIComponent(identifier)}`);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const sort = String(resolveValue(node.parameters.sort, itemJson) ?? "");
    const modifiedSince = String(resolveValue(node.parameters.modifiedSince, itemJson) ?? "");
    const qs = new URLSearchParams();
    qs.set("limit", String(returnAll ? 1000 : limit));
    qs.set("offset", "0");
    if (sort) qs.set("sort", sort);
    if (modifiedSince) qs.set("modifiedSince", modifiedSince);

    const results = await brevoRequestAll(apiKey, "/contacts", returnAll, limit, qs, "contacts");
    return results.map((r) => ({ json: r }));
  }

  if (operation === "update") {
    const identifier = String(resolveValue(node.parameters.identifier, itemJson) ?? "");
    if (!identifier) throw new Error("Brevo: identifier is required for contact update");
    const body: Record<string, unknown> = {};

    const attributesRaw = node.parameters.attributes as Record<string, unknown> | undefined;
    if (attributesRaw) {
      const values = (attributesRaw.attributesValues as Record<string, unknown> | undefined)?.attributes as Array<Record<string, string>> | undefined;
      if (values && values.length > 0) {
        const attrs: Record<string, string> = {};
        for (const entry of values) {
          const k = String(resolveValue(entry.fieldName, itemJson) ?? "");
          const v = String(resolveValue(entry.fieldValue, itemJson) ?? "");
          if (k) attrs[k] = v;
        }
        if (Object.keys(attrs).length > 0) body.attributes = attrs;
      }
    }

    const listIds = resolveValue(node.parameters.listIds, itemJson);
    if (listIds) {
      const ids = typeof listIds === "string" ? listIds.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n)) : Array.isArray(listIds) ? listIds : [];
      if (ids.length > 0) body.listIds = ids;
    }

    await brevoRequest(apiKey, "PUT", `/contacts/${encodeURIComponent(identifier)}`, body);
    return { json: { success: true } };
  }

  if (operation === "delete") {
    const identifier = String(resolveValue(node.parameters.identifier, itemJson) ?? "");
    if (!identifier) throw new Error("Brevo: identifier is required for contact delete");
    await brevoRequest(apiKey, "DELETE", `/contacts/${encodeURIComponent(identifier)}`);
    return { json: { success: true } };
  }

  throw new Error(`Brevo: unsupported contact operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Contact Attribute
// ---------------------------------------------------------------------------

async function runAttributeOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const apiKey = await getApiKey(ctx);

  if (operation === "create" || operation === "update") {
    const category = String(resolveValue(node.parameters.attributeCategory, itemJson) ?? "");
    if (!category) throw new Error("Brevo: attributeCategory is required");
    const name = String(resolveValue(node.parameters.attributeName, itemJson) ?? "");
    if (!name) throw new Error("Brevo: attributeName is required");

    const body: Record<string, unknown> = {};
    if (operation === "create") {
      const attrType = String(resolveValue(node.parameters.attributeType, itemJson) ?? "");
      if (attrType) body.type = attrType;
    }
    const attrValue = resolveValue(node.parameters.attributeValue, itemJson);
    if (attrValue && typeof attrValue === "string") body.value = attrValue;

    const enumerationRaw = node.parameters.enumeration as Record<string, unknown> | undefined;
    if (enumerationRaw) {
      const values = (enumerationRaw.enumerationValues as Record<string, unknown> | undefined)?.enumeration as Array<Record<string, string>> | undefined;
      if (values && values.length > 0) {
        body.enumeration = values;
      }
    }

    const method = operation === "create" ? "POST" : "PUT";
    const path = `/contacts/attributes/${encodeURIComponent(category)}/${encodeURIComponent(name)}`;
    await brevoRequest(apiKey, method, path, body);
    return { json: { success: true } };
  }

  if (operation === "delete") {
    const category = String(resolveValue(node.parameters.attributeCategory, itemJson) ?? "");
    if (!category) throw new Error("Brevo: attributeCategory is required");
    const name = String(resolveValue(node.parameters.attributeName, itemJson) ?? "");
    if (!name) throw new Error("Brevo: attributeName is required");
    await brevoRequest(apiKey, "DELETE", `/contacts/attributes/${encodeURIComponent(category)}/${encodeURIComponent(name)}`);
    return { json: { success: true } };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const results = await brevoRequestAll(apiKey, "/contacts/attributes", returnAll, limit, new URLSearchParams(), "attributes");
    return results.map((r) => ({ json: r }));
  }

  throw new Error(`Brevo: unsupported attribute operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

async function runEmailOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const apiKey = await getApiKey(ctx);

  if (operation === "send" || operation === "sendTemplate") {
    const body: Record<string, unknown> = {};

    if (operation === "sendTemplate") {
      const templateId = resolveValue(node.parameters.templateId, itemJson);
      if (templateId !== undefined && templateId !== null && templateId !== "") {
        body.templateId = Number(templateId);
      }
    }

    if (operation === "send") {
      const sendHTML = Boolean(resolveValue(node.parameters.sendHTML, itemJson));
      const subject = String(resolveValue(node.parameters.subject, itemJson) ?? "");
      const textContent = String(resolveValue(node.parameters.textContent, itemJson) ?? "");
      const htmlContent = String(resolveValue(node.parameters.htmlContent, itemJson) ?? "");
      const sender = String(resolveValue(node.parameters.sender, itemJson) ?? "");

      if (subject) body.subject = subject;
      if (sendHTML && htmlContent) body.htmlContent = htmlContent;
      if (!sendHTML && textContent) body.textContent = textContent;
      if (sender) body.sender = { email: sender };
    }

    const recipients = String(resolveValue(node.parameters.recipients, itemJson) ?? "");
    if (recipients) {
      body.to = recipients.split(",").map((r) => ({ email: r.trim() }));
    }

    if (operation === "sendTemplate") {
      const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
      const templateParams = (additionalFields.templateParameters as Record<string, unknown> | undefined)?.parameterValues as Record<string, unknown> | undefined;
      if (templateParams?.parameters) {
        const params: Record<string, string> = {};
        const pairs = String(templateParams.parameters).split(",");
        for (const pair of pairs) {
          const [k, v] = pair.split("=");
          if (k) params[k.trim()] = (v ?? "").trim();
        }
        if (Object.keys(params).length > 0) body.params = params;
      }
    }

    if (operation === "send") {
      const bccRaw = resolveValue(node.parameters.bcc, itemJson);
      if (bccRaw && typeof bccRaw === "object") {
        const bccValues = (bccRaw as Record<string, unknown>).bccValues as Array<Record<string, string>> | undefined;
        if (bccValues && bccValues.length > 0) {
          body.bcc = bccValues.map((b) => ({ email: b.email }));
        }
      }
      const ccRaw = resolveValue(node.parameters.cc, itemJson);
      if (ccRaw && typeof ccRaw === "object") {
        const ccValues = (ccRaw as Record<string, unknown>).ccValues as Array<Record<string, string>> | undefined;
        if (ccValues && ccValues.length > 0) {
          body.cc = ccValues.map((c) => ({ email: c.email }));
        }
      }
      const tagsRaw = resolveValue(node.parameters.tags, itemJson);
      if (tagsRaw && typeof tagsRaw === "object") {
        const tagValues = (tagsRaw as Record<string, unknown>).tagValues as Array<Record<string, string>> | undefined;
        if (tagValues && tagValues.length > 0) {
          body.tags = tagValues.map((t) => String(t.tag ?? ""));
        }
      }
    }

    const res = await brevoRequest(apiKey, "POST", "/smtp/email", body);
    return { json: asObj(res) };
  }

  throw new Error(`Brevo: unsupported email operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Sender
// ---------------------------------------------------------------------------

async function runSenderOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const apiKey = await getApiKey(ctx);

  if (operation === "create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!name || !email) throw new Error("Brevo: name and email are required for sender create");
    const res = await brevoRequest(apiKey, "POST", "/senders", { name, email });
    return { json: asObj(res) };
  }

  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Brevo: id is required for sender delete");
    await brevoRequest(apiKey, "DELETE", `/senders/${encodeURIComponent(id)}`);
    return { json: { success: true } };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 10);
    const results = await brevoRequestAll(apiKey, "/senders", returnAll, limit, new URLSearchParams(), "senders");
    return results.map((r) => ({ json: r }));
  }

  throw new Error(`Brevo: unsupported sender operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function brevoRequest(
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
        "api-key": apiKey,
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
      const obj = asObj(parsed);
      const errMsg = obj.message ?? obj.error ?? `HTTP ${response.status}`;
      throw new Error(String(errMsg));
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith("Brevo") || err.message.includes("HTTP"))) {
      throw err;
    }
    if (err instanceof Error) {
      throw new Error(`Brevo request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function brevoRequestAll(
  apiKey: string,
  path: string,
  returnAll: boolean,
  limit: number,
  baseQs: URLSearchParams,
  envelopeKey: string,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let offset = 0;
  const pageSize = returnAll ? 1000 : Math.min(limit, 1000);

  do {
    const qs = new URLSearchParams(baseQs);
    qs.set("limit", String(pageSize));
    qs.set("offset", String(offset));
    const url = `${path}?${qs.toString()}`;
    const res = (await brevoRequest(apiKey, "GET", url)) as Record<string, unknown> | null;
    if (!res) break;
    const items = (res[envelopeKey] ?? []) as Record<string, unknown>[];
    results.push(...items);
    offset += pageSize;
  } while (returnAll && results.length > 0);

  if (!returnAll && limit > 0) {
    return results.slice(0, limit);
  }
  return results;
}
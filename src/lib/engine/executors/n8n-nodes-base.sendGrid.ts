import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.sendgrid.com/v3";

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

export const sendGridExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "list");
  const operation = String(node.parameters.operation ?? "upsert");
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
  const cred = await ctx.getCredential("sendGridApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("SendGrid: sendGridApi credential is not configured");
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
  if (resource === "mail") {
    return runMailOperation(ctx, node, operation, itemJson);
  }
  if (resource === "contact") {
    return runContactOperation(ctx, node, operation, itemJson);
  }
  if (resource === "list") {
    return runListOperation(ctx, node, operation, itemJson);
  }
  throw new Error(`SendGrid: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

async function runMailOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  if (operation !== "send") {
    throw new Error(`SendGrid: unsupported mail operation "${operation}"`);
  }

  const apiKey = await getApiKey(ctx);

  const personalizations: Record<string, unknown>[] = [{ to: [] as Record<string, string>[] }];
  const body: Record<string, unknown> = { personalizations };

  const fromEmail = String(resolveValue(node.parameters.fromEmail, itemJson) ?? "");
  const fromName = String(resolveValue(node.parameters.fromName, itemJson) ?? "");
  const toEmail = String(resolveValue(node.parameters.toEmail, itemJson) ?? "");
  const subject = String(resolveValue(node.parameters.subject, itemJson) ?? "");
  const dynamicTemplate = Boolean(resolveValue(node.parameters.dynamicTemplate, itemJson));

  if (toEmail) {
    (personalizations[0].to as Record<string, string>[]).push({ email: toEmail });
  }

  const from: Record<string, string> = {};
  if (fromEmail) from.email = fromEmail;
  if (fromName) from.name = fromName;
  if (Object.keys(from).length > 0) body.from = from;

  if (dynamicTemplate) {
    const templateId = String(resolveValue(node.parameters.templateId, itemJson) ?? "");
    if (templateId) body.template_id = templateId;

    const dynamicFields = (node.parameters.dynamicTemplateFields ?? {}) as Record<string, unknown>;
    const values = (dynamicFields.values ?? []) as Array<Record<string, string>>;
    if (values.length > 0) {
      const data: Record<string, string> = {};
      for (const entry of values) {
        const k = String(resolveValue(entry.key, itemJson) ?? "");
        const v = String(resolveValue(entry.value, itemJson) ?? "");
        if (k) data[k] = v;
      }
      if (Object.keys(data).length > 0) {
        personalizations[0].dynamic_template_data = data;
      }
    }
  } else {
    if (subject) body.subject = subject;
    const contentType = String(resolveValue(node.parameters.contentType, itemJson) ?? "text");
    const contentValue = String(resolveValue(node.parameters.contentValue, itemJson) ?? "");
    const mimeType = contentType === "html" ? "text/html" : "text/plain";
    body.content = [{ type: mimeType, value: contentValue }];
  }

  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const replyTo = resolveValue(additionalFields.replyTo, itemJson);
  if (replyTo) body.reply_to = { email: String(replyTo) };

  await sendGridRequest(apiKey, "POST", "/mail/send", body);
  return { json: { success: true } };
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

  if (operation === "upsert") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!email) throw new Error("SendGrid: email is required for contact upsert");

    const contact: Record<string, unknown> = { email };
    const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
    for (const field of ["first_name", "last_name", "city", "country", "postal_code", "state_province_region", "address_line_1", "address_line_2"]) {
      const val = resolveValue(additionalFields[field], itemJson);
      if (val) contact[field] = val;
    }

    const res = await sendGridRequest(apiKey, "PUT", "/marketing/contacts", { contacts: [contact] });
    return { json: asObj(res) };
  }

  if (operation === "delete") {
    const by = String(node.parameters.by ?? "ids");
    const params: Record<string, string> = {};
    if (by === "ids") {
      const ids = String(resolveValue(node.parameters.ids, itemJson) ?? "");
      if (!ids) throw new Error("SendGrid: ids is required for contact delete by IDs");
      params.ids = ids;
    } else {
      params.delete_all_contacts = "true";
    }
    const qs = new URLSearchParams(params).toString();
    const res = await sendGridRequest(apiKey, "DELETE", `/marketing/contacts?${qs}`);
    if (res) return { json: asObj(res) };
    return { json: { success: true } };
  }

  if (operation === "get") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("SendGrid: contactId is required");
    const res = await sendGridRequest(apiKey, "GET", `/marketing/contacts/${contactId}`);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const results = await sendGridRequestAll(apiKey, "/marketing/contacts", returnAll, limit);
    return results.map((r) => ({ json: r }));
  }

  throw new Error(`SendGrid: unsupported contact operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

async function runListOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const apiKey = await getApiKey(ctx);

  if (operation === "create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (!name) throw new Error("SendGrid: name is required for list create");
    const res = await sendGridRequest(apiKey, "POST", "/marketing/lists", { name });
    return { json: asObj(res) };
  }

  if (operation === "get") {
    const listId = String(resolveValue(node.parameters.listId, itemJson) ?? "");
    if (!listId) throw new Error("SendGrid: listId is required");
    const res = await sendGridRequest(apiKey, "GET", `/marketing/lists/${listId}`);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const results = await sendGridRequestAll(apiKey, "/marketing/lists", returnAll, limit);
    return results.map((r) => ({ json: r }));
  }

  if (operation === "update") {
    const listId = String(resolveValue(node.parameters.listId, itemJson) ?? "");
    if (!listId) throw new Error("SendGrid: listId is required for list update");
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (!name) throw new Error("SendGrid: name is required for list update");
    const res = await sendGridRequest(apiKey, "PATCH", `/marketing/lists/${listId}`, { name });
    return { json: asObj(res) };
  }

  if (operation === "delete") {
    const listId = String(resolveValue(node.parameters.listId, itemJson) ?? "");
    if (!listId) throw new Error("SendGrid: listId is required for list delete");
    const deleteContacts = Boolean(resolveValue(node.parameters.deleteContacts, itemJson));
    const qs = deleteContacts ? "?delete_contacts=true" : "";
    const res = await sendGridRequest(apiKey, "DELETE", `/marketing/lists/${listId}${qs}`);
    if (res) return { json: asObj(res) };
    return { json: { success: true } };
  }

  throw new Error(`SendGrid: unsupported list operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function sendGridRequest(
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
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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
      const errors = obj.errors as Array<{ message: string }> | undefined;
      const errMsg = errors?.[0]?.message ?? String(obj.message ?? obj.error ?? `HTTP ${response.status}`);
      throw new Error(errMsg);
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith("SendGrid") || err.message.includes("HTTP"))) {
      throw err;
    }
    if (err instanceof Error) {
      throw new Error(`SendGrid request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function sendGridRequestAll(
  apiKey: string,
  path: string,
  returnAll: boolean,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let nextToken = "";

  const pageSize = returnAll ? 1000 : Math.min(limit, 1000);
  let url = `${API_BASE}${path}?page_size=${pageSize}`;

  do {
    const res = (await sendGridRequest(apiKey, "GET", url.replace(API_BASE, ""))) as Record<string, unknown> | null;
    if (!res) break;
    const items = (res.result ?? []) as Record<string, unknown>[];
    results.push(...items);
    const metadata = res._metadata as Record<string, unknown> | undefined;
    nextToken = metadata ? String(metadata.next ?? "") : "";
    if (nextToken) {
      url = `${API_BASE}${path}?page_size=${pageSize}&page_token=${nextToken}`;
    }
  } while (returnAll && nextToken);

  if (!returnAll && limit > 0) {
    return results.slice(0, limit);
  }
  return results;
}
import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.convertkit.com/v3";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function("$json", "return " + raw.replace(/^\s*=\s*/, "").replace(/\{\{([\s\S]*?)\}\}/g, "$1"));
      return fn(itemJson);
    } catch {
      return raw;
    }
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

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("convertKitApi");
  if (cred) {
    const data = cred as Record<string, unknown>;
    const apiKey = String(data.apiKey ?? data.apiSecret ?? "");
    if (apiKey) return { "Content-Type": "application/json", Accept: "application/json" };
  }
  return { "Content-Type": "application/json", Accept: "application/json" };
}

async function apiRequest(
  method: string,
  path: string,
  apiKey: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const qp = { api_secret: apiKey, ...(params ?? {}) };
  const qs = `?${new URLSearchParams(qp).toString()}`;
  const url = `${API_BASE}${path}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
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
    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed as Record<string, unknown>);
      const errMsg = (obj.error as string) ?? (obj.message as string) ?? `ConvertKit API error: ${response.status}`;
      const err = new Error(errMsg);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return asObj(parsed as Record<string, unknown>);
  } finally {
    clearTimeout(timer);
  }
}

export const convertKitExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "tag");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("convertKitApi");
  const apiKey = cred ? String((cred as Record<string, unknown>).apiKey ?? (cred as Record<string, unknown>).apiSecret ?? "") : "";

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(node, resource, operation, itemJson, apiKey);
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

async function runOperation(
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<OpResultList> {
  if (!apiKey) throw new Error("ConvertKit: API Secret is required. Configure a convertKitApi credential.");

  switch (resource) {
    case "customField": return runCustomFieldOperation(node, operation, itemJson, apiKey);
    case "form": return runFormOperation(node, operation, itemJson, apiKey);
    case "sequence": return runSequenceOperation(node, operation, itemJson, apiKey);
    case "tag": return runTagOperation(node, operation, itemJson, apiKey);
    case "tagSubscriber": return runTagSubscriberOperation(node, operation, itemJson, apiKey);
    default: throw new Error(`ConvertKit: unsupported resource "${resource}"`);
  }
}

// ---------------------------------------------------------------------------
// Custom Field
// ---------------------------------------------------------------------------

async function runCustomFieldOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<OpResultList> {
  if (operation === "create") {
    const label = String(resolveValue(node.parameters.label, itemJson) ?? "");
    if (!label) throw new Error("ConvertKit: label is required for customField create");
    const res = await apiRequest("POST", "/custom_fields", apiKey, { label });
    return { json: { customField: res.custom_field ?? {} } };
  }

  if (operation === "delete") {
    const fieldId = String(resolveValue(node.parameters.fieldId, itemJson) ?? "");
    if (!fieldId) throw new Error("ConvertKit: fieldId is required for customField delete");
    await apiRequest("DELETE", `/custom_fields/${fieldId}`, apiKey);
    return { json: { success: true } };
  }

  if (operation === "getAll") {
    const res = await apiRequest("GET", "/custom_fields", apiKey);
    return { json: { customFields: res.custom_fields ?? [] } };
  }

  if (operation === "update") {
    const fieldId = String(resolveValue(node.parameters.fieldId, itemJson) ?? "");
    if (!fieldId) throw new Error("ConvertKit: fieldId is required for customField update");
    const label = String(resolveValue(node.parameters.label, itemJson) ?? "");
    const res = await apiRequest("PATCH", `/custom_fields/${fieldId}`, apiKey, { label });
    return { json: { customField: res.custom_field ?? {} } };
  }

  throw new Error(`ConvertKit: unsupported customField operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

async function runFormOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<OpResultList> {
  if (operation === "addSubscriber") {
    const formId = String(resolveValue(node.parameters.formId, itemJson) ?? "");
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!formId || !email) throw new Error("ConvertKit: formId and email are required for form addSubscriber");
    const tags = resolveValue(node.parameters.tags, itemJson);
    const body: Record<string, unknown> = { email };
    if (tags) body.tags = tags;
    const res = await apiRequest("POST", `/forms/${formId}/subscribe`, apiKey, body);
    return { json: { subscriber: res.subscriber ?? {} } };
  }

  if (operation === "getAll") {
    const res = await apiRequest("GET", "/forms", apiKey);
    return { json: { forms: res.forms ?? [] } };
  }

  if (operation === "listSubscriptions") {
    const formId = String(resolveValue(node.parameters.formId, itemJson) ?? "");
    if (!formId) throw new Error("ConvertKit: formId is required for form listSubscriptions");
    const res = await apiRequest("GET", `/forms/${formId}/subscriptions`, apiKey);
    return { json: { subscribers: res.subscribers ?? [] } };
  }

  throw new Error(`ConvertKit: unsupported form operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Sequence
// ---------------------------------------------------------------------------

async function runSequenceOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<OpResultList> {
  if (operation === "addSubscriber") {
    const sequenceId = String(resolveValue(node.parameters.sequenceId, itemJson) ?? "");
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!sequenceId || !email) throw new Error("ConvertKit: sequenceId and email are required for sequence addSubscriber");
    const tags = resolveValue(node.parameters.tags, itemJson);
    const body: Record<string, unknown> = { email };
    if (tags) body.tags = tags;
    const res = await apiRequest("POST", `/sequences/${sequenceId}/subscribe`, apiKey, body);
    return { json: { subscriber: res.subscriber ?? {} } };
  }

  if (operation === "getAll") {
    const res = await apiRequest("GET", "/sequences", apiKey);
    return { json: { sequences: res.sequences ?? [] } };
  }

  if (operation === "listSubscriptions") {
    const sequenceId = String(resolveValue(node.parameters.sequenceId, itemJson) ?? "");
    if (!sequenceId) throw new Error("ConvertKit: sequenceId is required for sequence listSubscriptions");
    const res = await apiRequest("GET", `/sequences/${sequenceId}/subscriptions`, apiKey);
    return { json: { subscribers: res.subscribers ?? [] } };
  }

  throw new Error(`ConvertKit: unsupported sequence operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

async function runTagOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<OpResultList> {
  if (operation === "create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (!name) throw new Error("ConvertKit: name is required for tag create");
    const body: Record<string, unknown> = { name };
    const email = resolveValue(node.parameters.email, itemJson);
    if (email) body.email = email;
    const res = await apiRequest("POST", "/tags", apiKey, body);
    return { json: { tag: res.tag ?? {} } };
  }

  if (operation === "getAll") {
    const res = await apiRequest("GET", "/tags", apiKey);
    return { json: { tags: res.tags ?? [] } };
  }

  throw new Error(`ConvertKit: unsupported tag operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Tag Subscriber
// ---------------------------------------------------------------------------

async function runTagSubscriberOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<OpResultList> {
  if (operation === "add") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    const tagId = String(resolveValue(node.parameters.tagId, itemJson) ?? "");
    if (!email || !tagId) throw new Error("ConvertKit: email and tagId are required for tagSubscriber add");
    const res = await apiRequest("POST", `/tags/${tagId}/subscribe`, apiKey, { email });
    return { json: { subscriber: res.subscriber ?? {} } };
  }

  if (operation === "listSubscriptions") {
    const tagId = String(resolveValue(node.parameters.tagId, itemJson) ?? "");
    if (!tagId) throw new Error("ConvertKit: tagId is required for tagSubscriber listSubscriptions");
    const res = await apiRequest("GET", `/tags/${tagId}/subscriptions`, apiKey);
    return { json: { subscribers: res.subscribers ?? [] } };
  }

  if (operation === "remove") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    const tagId = String(resolveValue(node.parameters.tagId, itemJson) ?? "");
    if (!email || !tagId) throw new Error("ConvertKit: email and tagId are required for tagSubscriber remove");
    await apiRequest("DELETE", `/tags/${tagId}/unsubscribe`, apiKey, { email });
    return { json: { success: true } };
  }

  throw new Error(`ConvertKit: unsupported tagSubscriber operation "${operation}"`);
}

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

function processError(body: unknown, status: number, resource: string, operation: string): Error {
  const obj = asObj(body);
  const err = Array.isArray(obj) ? obj[0] : obj;
  const e = err as Record<string, unknown> | undefined;
  let message = `Salesforce: HTTP ${status}`;
  if (e) {
    const errCode = e.errorCode ? String(e.errorCode) : "";
    const errMsg = e.message ? String(e.message) : "";
    message = errCode && errMsg ? `Salesforce: ${errCode} — ${errMsg}` : `Salesforce: ${errMsg || errCode || status}`;
  }
  message += ` (${resource}/${operation})`;
  return new Error(message);
}

async function sfRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Salesforce request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function getAuthHeaders(ctx: ExecutionContext): Promise<{ headers: Record<string, string>; instanceUrl: string }> {
  const cred = await ctx.getCredential("salesforceOAuth2Api");
  const token = cred ? String(cred.accessToken ?? cred.token ?? "") : "";
  if (!token) {
    throw new Error("Salesforce: credential is not configured (no access token)");
  }
  const instanceUrl = cred ? String(cred.instanceUrl ?? "").replace(/\/$/, "") : "";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  return { headers, instanceUrl };
}

function capitalizeSobject(resource: string): string {
  if (resource === "customObject") return "";
  if (resource === "search" || resource === "flow" || resource === "document") return resource;
  return resource.charAt(0).toUpperCase() + resource.slice(1);
}

function buildFields(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const raw = node.parameters.fields;
  if (!raw) return {};

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const fields: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(parsed)) {
          fields[key] = resolveValue(val, itemJson);
        }
        return fields;
      }
    } catch {
      /* not JSON, fall through */
    }
  }

  if (typeof raw === "object" && raw !== null) {
    if (!Array.isArray(raw)) {
      const fields: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
        fields[key] = resolveValue(val, itemJson);
      }
      return fields;
    }
  }

  return {};
}

export const salesforceToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "account");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();
  const { headers, instanceUrl } = await getAuthHeaders(ctx);

  if (!instanceUrl) {
    throw new Error("Salesforce: instanceUrl is not configured in credentials");
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(instanceUrl, node, resource, operation, itemJson, headers);
      for (const json of results) {
        out.push({ json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (operation === "delete") {
        out.push({ json: { success: true, message }, pairedItem });
      } else {
        out.push({ json: { error: message }, pairedItem });
      }
    }
  }

  return [out];
};

async function runOperation(
  instanceUrl: string,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const baseUrl = `${instanceUrl}/services/data/v58.0`;

  const sobjectResource = resource === "customObject"
    ? String(node.parameters.customObjectApiName ?? "")
    : capitalizeSobject(resource);

  switch (resource) {
    case "search":
      if (operation === "query") {
        return searchQuery(baseUrl, node, itemJson, headers);
      }
      throw new Error(`Salesforce: unsupported search operation "${operation}"`);
    case "flow":
      if (operation === "getAll") return flowGetAll(baseUrl, headers);
      if (operation === "invoke") return [await flowInvoke(baseUrl, node, itemJson, headers)];
      throw new Error(`Salesforce: unsupported flow operation "${operation}"`);
    case "document":
      if (operation === "upload") return [await documentUpload(baseUrl, node, itemJson, headers)];
      throw new Error(`Salesforce: unsupported document operation "${operation}"`);
    case "user":
      if (operation === "get") return [await sobjectGet(baseUrl, "User", node, itemJson, headers)];
      if (operation === "getAll") return sobjectList(baseUrl, "User", node, itemJson, headers);
      throw new Error(`Salesforce: unsupported user operation "${operation}"`);
  }

  switch (operation) {
    case "create":
      return [await sobjectCreate(baseUrl, sobjectResource, node, itemJson, headers)];
    case "get":
      return [await sobjectGet(baseUrl, sobjectResource, node, itemJson, headers)];
    case "getAll":
      return sobjectList(baseUrl, sobjectResource, node, itemJson, headers);
    case "update":
      return [await sobjectUpdate(baseUrl, sobjectResource, node, itemJson, headers)];
    case "delete":
      return [await sobjectDelete(baseUrl, sobjectResource, node, itemJson, headers)];
    case "upsert":
      return [await sobjectUpsert(baseUrl, sobjectResource, node, itemJson, headers)];
    case "addNote":
      return [await addNote(baseUrl, resource, node, itemJson, headers)];
    case "addComment":
      return [await addComment(baseUrl, resource, node, itemJson, headers)];
    case "addToCampaign":
      return [await addToCampaign(baseUrl, resource, node, itemJson, headers)];
    case "getMetadata":
      return [await sobjectDescribe(baseUrl, sobjectResource, headers)];
    default:
      throw new Error(`Salesforce: unsupported operation "${operation}" for resource "${resource}"`);
  }
}

async function sobjectCreate(
  baseUrl: string,
  sobject: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const fields = buildFields(node, itemJson);
  const url = `${baseUrl}/sobjects/${encodeURIComponent(sobject)}`;
  const res = await sfRequest("POST", url, headers, fields);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, sobject, "create");
  const result = asObj(res.body);
  return { ...(result as Record<string, unknown>), ...fields };
}

async function sobjectGet(
  baseUrl: string,
  sobject: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const recordId = String(resolveValue(node.parameters.recordId, itemJson) ?? "");
  if (!recordId) throw new Error(`Salesforce: recordId is required for ${sobject} get`);
  const url = `${baseUrl}/sobjects/${encodeURIComponent(sobject)}/${encodeURIComponent(recordId)}`;
  const res = await sfRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, sobject, "get");
  return asObj(res.body);
}

async function sobjectList(
  baseUrl: string,
  sobject: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const returnAll = node.parameters.returnAll === true;
  const limit = Math.min(Number(node.parameters.limit ?? 50), 2000);
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const fields = options.fields ? String(options.fields) : "Id,Name";
  const condition = options.condition ? String(resolveValue(options.condition, itemJson)) : "";

  let query = `SELECT ${fields} FROM ${sobject}`;
  if (condition) query += ` WHERE ${condition}`;
  if (!returnAll) query += ` LIMIT ${limit}`;

  const url = `${baseUrl}/query?q=${encodeURIComponent(query)}`;
  const all: Record<string, unknown>[] = [];
  let nextUrl: string | undefined = url;

  for (;;) {
    const res = await sfRequest("GET", nextUrl, headers);
    if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, sobject, "getAll");
    const obj = asObj(res.body);
    const records = Array.isArray(obj.records) ? (obj.records as Record<string, unknown>[]) : [];
    all.push(...records);
    if (!returnAll && all.length >= limit) break;
    nextUrl = typeof obj.nextRecordsUrl === "string" ? `${baseUrl}${obj.nextRecordsUrl}` : undefined;
    if (!nextUrl) break;
  }

  if (!returnAll) return all.slice(0, limit);
  return all;
}

async function sobjectUpdate(
  baseUrl: string,
  sobject: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const recordId = String(resolveValue(node.parameters.recordId, itemJson) ?? "");
  if (!recordId) throw new Error(`Salesforce: recordId is required for ${sobject} update`);
  const fields = buildFields(node, itemJson);
  const url = `${baseUrl}/sobjects/${encodeURIComponent(sobject)}/${encodeURIComponent(recordId)}`;
  const res = await sfRequest("PATCH", url, headers, fields);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, sobject, "update");
  return { id: recordId, success: true };
}

async function sobjectDelete(
  baseUrl: string,
  sobject: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const recordId = String(resolveValue(node.parameters.recordId, itemJson) ?? "");
  if (!recordId) throw new Error(`Salesforce: recordId is required for ${sobject} delete`);
  const url = `${baseUrl}/sobjects/${encodeURIComponent(sobject)}/${encodeURIComponent(recordId)}`;
  const res = await sfRequest("DELETE", url, headers);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, sobject, "delete");
  return { id: recordId, success: true };
}

async function sobjectUpsert(
  baseUrl: string,
  sobject: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const recordId = String(resolveValue(node.parameters.recordId, itemJson) ?? "");
  const fields = buildFields(node, itemJson);
  const url = recordId
    ? `${baseUrl}/sobjects/${encodeURIComponent(sobject)}/${encodeURIComponent(recordId)}`
    : `${baseUrl}/sobjects/${encodeURIComponent(sobject)}`;
  const method = recordId ? "PATCH" : "POST";
  const res = await sfRequest(method, url, headers, fields);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, sobject, "upsert");
  const result = asObj(res.body);
  return { id: result.id ?? recordId, success: result.success ?? true, ...fields };
}

async function searchQuery(
  baseUrl: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const queryText = String(resolveValue(node.parameters.query, itemJson) ?? "");
  if (!queryText) throw new Error("Salesforce: query is required for search");
  const returnAll = node.parameters.returnAll === true;
  const limit = Math.min(Number(node.parameters.limit ?? 50), 2000);

  let query = queryText;
  if (!returnAll) {
    const hasLimit = /\bLIMIT\b/i.test(query);
    if (!hasLimit) query += ` LIMIT ${limit}`;
  }

  const url = `${baseUrl}/query?q=${encodeURIComponent(query)}`;
  const all: Record<string, unknown>[] = [];
  let nextUrl: string | undefined = url;

  for (;;) {
    const res = await sfRequest("GET", nextUrl, headers);
    if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, "search", "query");
    const obj = asObj(res.body);
    const records = Array.isArray(obj.records) ? (obj.records as Record<string, unknown>[]) : [];
    all.push(...records);
    if (!returnAll && all.length >= limit) break;
    nextUrl = typeof obj.nextRecordsUrl === "string" ? `${baseUrl}${obj.nextRecordsUrl}` : undefined;
    if (!nextUrl) break;
  }

  if (!returnAll) return all.slice(0, limit);
  return all;
}

async function flowGetAll(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const url = `${baseUrl}/tooling/query?q=${encodeURIComponent("SELECT Id, ApiName, Label, Status, VersionNumber FROM FlowDefinitionView ORDER BY ApiName")}`;
  const res = await sfRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, "flow", "getAll");
  const obj = asObj(res.body);
  return Array.isArray(obj.records) ? (obj.records as Record<string, unknown>[]) : [];
}

async function flowInvoke(
  baseUrl: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const flowApiName = String(node.parameters.flowApiName ?? "");
  if (!flowApiName) throw new Error("Salesforce: flowApiName is required for flow invoke");
  const inputs = buildFields(node, itemJson);
  const url = `${baseUrl}/actions/custom/flow/${encodeURIComponent(flowApiName)}`;
  const body: Record<string, unknown> = { inputs: [inputs] };
  const res = await sfRequest("POST", url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, "flow", "invoke");
  return asObj(res.body);
}

async function documentUpload(
  baseUrl: string,
  _node: INode,
  _itemJson: Record<string, unknown>,
  _headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  throw new Error("Salesforce: document upload is not yet implemented");
}

async function addNote(
  baseUrl: string,
  sobject: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const parentId = String(resolveValue(node.parameters.recordId, itemJson) ?? "");
  if (!parentId) throw new Error("Salesforce: recordId is required for addNote");
  const fields = buildFields(node, itemJson);
  const note: Record<string, unknown> = { ...fields, ParentId: parentId };
  const url = `${baseUrl}/sobjects/Note`;
  const res = await sfRequest("POST", url, headers, note);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, sobject, "addNote");
  return asObj(res.body);
}

async function addComment(
  baseUrl: string,
  sobject: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const parentId = String(resolveValue(node.parameters.recordId, itemJson) ?? "");
  if (!parentId) throw new Error("Salesforce: recordId is required for addComment");
  const fields = buildFields(node, itemJson);
  const comment: Record<string, unknown> = { ...fields, ParentId: parentId };
  const url = `${baseUrl}/sobjects/CaseComment`;
  const res = await sfRequest("POST", url, headers, comment);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, sobject, "addComment");
  return asObj(res.body);
}

async function addToCampaign(
  baseUrl: string,
  _sobject: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const contactId = String(resolveValue(node.parameters.recordId, itemJson) ?? "");
  if (!contactId) throw new Error("Salesforce: recordId is required for addToCampaign");
  const fields = buildFields(node, itemJson);
  const member: Record<string, unknown> = { ...fields, ContactId: contactId };
  const url = `${baseUrl}/sobjects/CampaignMember`;
  const res = await sfRequest("POST", url, headers, member);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, _sobject, "addToCampaign");
  return asObj(res.body);
}

async function sobjectDescribe(
  baseUrl: string,
  sobject: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = `${baseUrl}/sobjects/${encodeURIComponent(sobject)}/describe`;
  const res = await sfRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, sobject, "getMetadata");
  const result = asObj(res.body);
  return {
    objectName: sobject,
    label: result.label,
    fields: result.fields,
    childRelationships: result.childRelationships,
  };
}

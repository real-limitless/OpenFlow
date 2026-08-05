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

export const serviceNowExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "incident");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message } }, pairedItem });
    }
  }

  return [out];
};

async function getCredentialAuth(ctx: ExecutionContext): Promise<{ baseUrl: string; headers: Record<string, string> }> {
  const cred = (await ctx.getCredential("serviceNowBasicApi")) ??
    (await ctx.getCredential("serviceNowOAuth2Api"));
  if (!cred) {
    throw new Error("ServiceNow: credential is not configured");
  }
  const c = cred as Record<string, unknown>;
  const subdomain = String(c.subdomain ?? "");
  if (!subdomain) {
    throw new Error("ServiceNow: subdomain is required in credentials");
  }
  const baseUrl = `https://${subdomain}.service-now.com/api/now`;

  let headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (c.oauthTokenData || c.oauth2Data) {
    const token = String(
      (c as Record<string, unknown>).accessToken ??
        ((c.oauthTokenData ?? c.oauth2Data) as Record<string, unknown>)?.accessToken ??
        "",
    );
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } else {
    const user = String(c.user ?? c.username ?? "");
    const password = String(c.password ?? "");
    if (user && password) {
      const encoded = Buffer.from(`${user}:${password}`).toString("base64");
      headers.Authorization = `Basic ${encoded}`;
    }
  }

  return { baseUrl, headers };
}

async function snRequest(
  baseUrl: string,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const qs = params && Object.keys(params).length > 0
    ? `?${new URLSearchParams(params).toString()}`
    : "";
  const url = `${baseUrl}/${path}${qs}`;
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
    } catch { /* keep text */ }
    return { status: response.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const { baseUrl, headers } = await getCredentialAuth(ctx);

  switch (resource) {
    case "incident":
      return runIncident(ctx, node, baseUrl, headers, operation, itemJson);
    case "user":
      return runUser(ctx, node, baseUrl, headers, operation, itemJson);
    case "tableRecord":
      return runTableRecord(ctx, node, baseUrl, headers, operation, itemJson);
    case "businessService":
      return runGetAllTable(ctx, node, baseUrl, headers, "cmdb_ci_service", "businessService", itemJson);
    case "configurationItem":
      return runGetAllTable(ctx, node, baseUrl, headers, "cmdb_ci", "configurationItem", itemJson);
    case "department":
      return runGetAllTable(ctx, node, baseUrl, headers, "cmn_department", "department", itemJson);
    case "dictionary":
      return runGetAllTable(ctx, node, baseUrl, headers, "sys_dictionary", "dictionary", itemJson);
    case "userGroup":
      return runGetAllTable(ctx, node, baseUrl, headers, "sys_user_group", "userGroup", itemJson);
    case "userRole":
      return runGetAllTable(ctx, node, baseUrl, headers, "sys_user_role", "userRole", itemJson);
    case "attachment":
      return runAttachment(ctx, node, baseUrl, headers, operation, itemJson);
    default:
      throw new Error(`ServiceNow: unsupported resource "${resource}"`);
  }
}

async function doGetAll(
  baseUrl: string,
  headers: Record<string, string>,
  table: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const res = await snRequest(baseUrl, "GET", `table/${table}`, headers, undefined, params);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`ServiceNow: HTTP ${res.status} querying ${table}`);
  }
  const result = (asObj(res.body).result as Record<string, unknown>[]) ?? [];
  return result;
}

async function runGetAllTable(
  _ctx: ExecutionContext,
  node: INode,
  baseUrl: string,
  headers: Record<string, string>,
  table: string,
  _resource: string,
  _itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 50);
  const params: Record<string, string> = {};
  if (!returnAll) {
    params.sysparm_limit = String(limit);
  }
  return doGetAll(baseUrl, headers, table, params);
}

async function runIncident(
  _ctx: ExecutionContext,
  node: INode,
  baseUrl: string,
  headers: Record<string, string>,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const body: Record<string, unknown> = {};
    const shortDescription = resolveValue(node.parameters.shortDescription, itemJson);
    if (shortDescription) body.short_description = String(shortDescription);
    const description = resolveValue(node.parameters.description, itemJson);
    if (description) body.description = String(description);
    const state = resolveValue(node.parameters.state, itemJson);
    if (state) body.state = String(state);
    const assignmentGroup = resolveValue(node.parameters.assignmentGroup, itemJson);
    if (assignmentGroup) body.assignment_group = String(assignmentGroup);
    const assignedTo = resolveValue(node.parameters.assignedTo, itemJson);
    if (assignedTo) body.assigned_to = String(assignedTo);
    const category = resolveValue(node.parameters.category, itemJson);
    if (category) body.category = String(category);
    const subcategory = resolveValue(node.parameters.subcategory, itemJson);
    if (subcategory) body.subcategory = String(subcategory);
    const impact = resolveValue(node.parameters.impact, itemJson);
    if (impact) body.impact = String(impact);
    const urgency = resolveValue(node.parameters.urgency, itemJson);
    if (urgency) body.urgency = String(urgency);
    const priority = resolveValue(node.parameters.priority, itemJson);
    if (priority) body.priority = String(priority);
    const callerId = resolveValue(node.parameters.callerId, itemJson);
    if (callerId) body.caller_id = String(callerId);

    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    if (additionalFields) {
      for (const [k, v] of Object.entries(additionalFields)) {
        if (v !== undefined && v !== null && v !== "") {
          body[k] = v;
        }
      }
    }

    const res = await snRequest(baseUrl, "POST", "table/incident", headers, body);
    if (res.status < 200 || res.status >= 300) {
      const obj = asObj(res.body);
      throw new Error(`ServiceNow: HTTP ${res.status} creating incident — ${JSON.stringify(obj)}`);
    }
    const result = asObj(res.body).result as Record<string, unknown> ?? {};
    return result;
  }

  if (operation === "get") {
    const sysId = String(resolveValue(node.parameters.incidentId, itemJson) ?? "");
    if (!sysId) throw new Error("ServiceNow: incidentId (sys_id) is required for incident get");
    const res = await snRequest(baseUrl, "GET", `table/incident/${encodeURIComponent(sysId)}`, headers);
    if (res.status === 404) throw new Error("ServiceNow: incident not found");
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} getting incident`);
    const result = asObj(res.body).result as Record<string, unknown> ?? {};
    return result;
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = {};
    if (!returnAll) params.sysparm_limit = String(limit);
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    if (additionalFields) {
      for (const [k, v] of Object.entries(additionalFields)) {
        if (v !== undefined && v !== null) params[k] = String(v);
      }
    }
    const res = await snRequest(baseUrl, "GET", "table/incident", headers, undefined, params);
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} querying incidents`);
    const results = (asObj(res.body).result as Record<string, unknown>[]) ?? [];
    return returnAll ? results : results.slice(0, limit);
  }

  if (operation === "update") {
    const sysId = String(resolveValue(node.parameters.incidentId, itemJson) ?? "");
    if (!sysId) throw new Error("ServiceNow: incidentId (sys_id) is required for incident update");
    const body: Record<string, unknown> = {};
    const shortDescription = resolveValue(node.parameters.shortDescription, itemJson);
    if (shortDescription) body.short_description = String(shortDescription);
    const description = resolveValue(node.parameters.description, itemJson);
    if (description) body.description = String(description);
    const state = resolveValue(node.parameters.state, itemJson);
    if (state) body.state = String(state);
    const assignmentGroup = resolveValue(node.parameters.assignmentGroup, itemJson);
    if (assignmentGroup) body.assignment_group = String(assignmentGroup);
    const assignedTo = resolveValue(node.parameters.assignedTo, itemJson);
    if (assignedTo) body.assigned_to = String(assignedTo);
    const impact = resolveValue(node.parameters.impact, itemJson);
    if (impact) body.impact = String(impact);
    const urgency = resolveValue(node.parameters.urgency, itemJson);
    if (urgency) body.urgency = String(urgency);
    const priority = resolveValue(node.parameters.priority, itemJson);
    if (priority) body.priority = String(priority);
    const category = resolveValue(node.parameters.category, itemJson);
    if (category) body.category = String(category);
    const subcategory = resolveValue(node.parameters.subcategory, itemJson);
    if (subcategory) body.subcategory = String(subcategory);
    const resolutionCode = resolveValue(node.parameters.resolutionCode, itemJson);
    if (resolutionCode) body.close_code = String(resolutionCode);
    const resolutionNotes = resolveValue(node.parameters.resolutionNotes, itemJson);
    if (resolutionNotes) body.close_notes = String(resolutionNotes);
    const holdReason = resolveValue(node.parameters.holdReason, itemJson);
    if (holdReason) body.hold_reason = String(holdReason);
    const callerId = resolveValue(node.parameters.callerId, itemJson);
    if (callerId) body.caller_id = String(callerId);

    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    if (additionalFields) {
      for (const [k, v] of Object.entries(additionalFields)) {
        if (v !== undefined && v !== null && v !== "") {
          body[k] = v;
        }
      }
    }

    const res = await snRequest(baseUrl, "PATCH", `table/incident/${encodeURIComponent(sysId)}`, headers, body);
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} updating incident`);
    const result = asObj(res.body).result as Record<string, unknown> ?? {};
    return result;
  }

  if (operation === "delete") {
    const sysId = String(resolveValue(node.parameters.incidentId, itemJson) ?? "");
    if (!sysId) throw new Error("ServiceNow: incidentId (sys_id) is required for incident delete");
    const res = await snRequest(baseUrl, "DELETE", `table/incident/${encodeURIComponent(sysId)}`, headers);
    if (res.status === 404) throw new Error("ServiceNow: incident not found");
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} deleting incident`);
    return { success: true };
  }

  throw new Error(`ServiceNow: unsupported incident operation "${operation}"`);
}

async function runUser(
  _ctx: ExecutionContext,
  node: INode,
  baseUrl: string,
  headers: Record<string, string>,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const body: Record<string, unknown> = {};
    const userName = resolveValue(node.parameters.userName, itemJson);
    if (userName) body.user_name = String(userName);
    const firstName = resolveValue(node.parameters.firstName, itemJson);
    if (firstName) body.first_name = String(firstName);
    const lastName = resolveValue(node.parameters.lastName, itemJson);
    if (lastName) body.last_name = String(lastName);
    const email = resolveValue(node.parameters.email, itemJson);
    if (email) body.email = String(email);
    const active = resolveValue(node.parameters.active, itemJson);
    if (active !== undefined) body.active = active === true || active === "true" || active === 1;
    const source = resolveValue(node.parameters.source, itemJson);
    if (source) body.source = String(source);
    const roles = resolveValue(node.parameters.roles, itemJson);
    if (roles) body.roles = String(roles);

    const res = await snRequest(baseUrl, "POST", "table/sys_user", headers, body);
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} creating user`);
    const result = asObj(res.body).result as Record<string, unknown> ?? {};
    return result;
  }

  if (operation === "get") {
    const sysId = String(resolveValue(node.parameters.userId, itemJson) ?? "");
    if (!sysId) throw new Error("ServiceNow: userId (sys_id) is required for user get");
    const res = await snRequest(baseUrl, "GET", `table/sys_user/${encodeURIComponent(sysId)}`, headers);
    if (res.status === 404) throw new Error("ServiceNow: user not found");
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} getting user`);
    const result = asObj(res.body).result as Record<string, unknown> ?? {};
    return result;
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = {};
    if (!returnAll) params.sysparm_limit = String(limit);
    const res = await snRequest(baseUrl, "GET", "table/sys_user", headers, undefined, params);
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} querying users`);
    const results = (asObj(res.body).result as Record<string, unknown>[]) ?? [];
    return results;
  }

  if (operation === "update") {
    const sysId = String(resolveValue(node.parameters.userId, itemJson) ?? "");
    if (!sysId) throw new Error("ServiceNow: userId (sys_id) is required for user update");
    const body: Record<string, unknown> = {};
    const userName = resolveValue(node.parameters.userName, itemJson);
    if (userName) body.user_name = String(userName);
    const firstName = resolveValue(node.parameters.firstName, itemJson);
    if (firstName) body.first_name = String(firstName);
    const lastName = resolveValue(node.parameters.lastName, itemJson);
    if (lastName) body.last_name = String(lastName);
    const email = resolveValue(node.parameters.email, itemJson);
    if (email) body.email = String(email);
    const active = resolveValue(node.parameters.active, itemJson);
    if (active !== undefined) body.active = active === true || active === "true" || active === 1;
    const source = resolveValue(node.parameters.source, itemJson);
    if (source) body.source = String(source);

    const res = await snRequest(baseUrl, "PATCH", `table/sys_user/${encodeURIComponent(sysId)}`, headers, body);
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} updating user`);
    const result = asObj(res.body).result as Record<string, unknown> ?? {};
    return result;
  }

  if (operation === "delete") {
    const sysId = String(resolveValue(node.parameters.userId, itemJson) ?? "");
    if (!sysId) throw new Error("ServiceNow: userId (sys_id) is required for user delete");
    const res = await snRequest(baseUrl, "DELETE", `table/sys_user/${encodeURIComponent(sysId)}`, headers);
    if (res.status === 404) throw new Error("ServiceNow: user not found");
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} deleting user`);
    return { success: true };
  }

  throw new Error(`ServiceNow: unsupported user operation "${operation}"`);
}

async function runTableRecord(
  _ctx: ExecutionContext,
  node: INode,
  baseUrl: string,
  headers: Record<string, string>,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const tableName = String(resolveValue(node.parameters.tableName, itemJson) ?? "");
  if (!tableName) throw new Error("ServiceNow: tableName is required for table record operations");

  if (operation === "create") {
    const fields = resolveValue(node.parameters.fields, itemJson);
    const body: Record<string, unknown> = {};
    if (fields && typeof fields === "object" && !Array.isArray(fields)) {
      for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
        if (v !== undefined && v !== null) {
          body[k] = v;
        }
      }
    }
    const res = await snRequest(baseUrl, "POST", `table/${encodeURIComponent(tableName)}`, headers, body);
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} creating record in ${tableName}`);
    const result = asObj(res.body).result as Record<string, unknown> ?? {};
    return result;
  }

  if (operation === "get") {
    const sysId = String(resolveValue(node.parameters.tableId, itemJson) ?? "");
    if (!sysId) throw new Error("ServiceNow: tableId (sys_id) is required for table record get");
    const res = await snRequest(baseUrl, "GET", `table/${encodeURIComponent(tableName)}/${encodeURIComponent(sysId)}`, headers);
    if (res.status === 404) throw new Error(`ServiceNow: record not found in ${tableName}`);
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} getting record from ${tableName}`);
    const result = asObj(res.body).result as Record<string, unknown> ?? {};
    return result;
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = {};
    if (!returnAll) params.sysparm_limit = String(limit);
    const matchType = String(node.parameters.matchType ?? "any");
    const conditions = node.parameters.conditions as Record<string, unknown> | undefined;
    if (conditions) {
      const filterValues = conditions.conditions as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(filterValues) && filterValues.length > 0) {
        const parts: string[] = [];
        for (const cond of filterValues) {
          const field = String(cond.field ?? "");
          const op = String(cond.operator ?? "=");
          const val = resolveValue(cond.value, itemJson);
          if (field && val !== undefined && val !== null && val !== "") {
            let opStr = op;
            if (op === "IN") opStr = "IN";
            else if (op === "STARTSWITH") opStr = "STARTSWITH";
            else if (op === "ENDSWITH") opStr = "ENDSWITH";
            else if (op === "CONTAINS") opStr = "CONTAINS";
            else if (op === "DOES NOT CONTAIN") opStr = "DOES NOT CONTAIN";
            else if (op === "IS EMPTY") { parts.push(`${field}=`); continue; }
            else if (op === "IS NOT EMPTY") { parts.push(`${field}!=`); continue; }
            parts.push(`${field}${opStr}${String(val)}`);
          }
        }
        if (parts.length > 0) {
          params.sysparm_query = parts.join(matchType === "all" ? "^" : "^OR");
        }
      }
    }
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    if (additionalFields) {
      for (const [k, v] of Object.entries(additionalFields)) {
        if (v !== undefined && v !== null) params[k] = String(v);
      }
    }
    const res = await snRequest(baseUrl, "GET", `table/${encodeURIComponent(tableName)}`, headers, undefined, params);
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} querying ${tableName}`);
    const results = (asObj(res.body).result as Record<string, unknown>[]) ?? [];
    return results;
  }

  if (operation === "update") {
    const sysId = String(resolveValue(node.parameters.tableId, itemJson) ?? "");
    if (!sysId) throw new Error("ServiceNow: tableId (sys_id) is required for table record update");
    const fields = resolveValue(node.parameters.fields, itemJson);
    const body: Record<string, unknown> = {};
    if (fields && typeof fields === "object" && !Array.isArray(fields)) {
      for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
        if (v !== undefined && v !== null) {
          body[k] = v;
        }
      }
    }
    const res = await snRequest(baseUrl, "PATCH", `table/${encodeURIComponent(tableName)}/${encodeURIComponent(sysId)}`, headers, body);
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} updating record in ${tableName}`);
    const result = asObj(res.body).result as Record<string, unknown> ?? {};
    return result;
  }

  if (operation === "delete") {
    const sysId = String(resolveValue(node.parameters.tableId, itemJson) ?? "");
    if (!sysId) throw new Error("ServiceNow: tableId (sys_id) is required for table record delete");
    const res = await snRequest(baseUrl, "DELETE", `table/${encodeURIComponent(tableName)}/${encodeURIComponent(sysId)}`, headers);
    if (res.status === 404) throw new Error(`ServiceNow: record not found in ${tableName}`);
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} deleting record from ${tableName}`);
    return { success: true };
  }

  throw new Error(`ServiceNow: unsupported table record operation "${operation}"`);
}

async function runAttachment(
  _ctx: ExecutionContext,
  node: INode,
  baseUrl: string,
  headers: Record<string, string>,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "get") {
    const attachmentId = String(resolveValue(node.parameters.attachmentId, itemJson) ?? "");
    if (!attachmentId) throw new Error("ServiceNow: attachmentId is required for attachment get");
    const res = await snRequest(baseUrl, "GET", `attachment/${encodeURIComponent(attachmentId)}`, headers);
    if (res.status === 404) throw new Error("ServiceNow: attachment not found");
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} getting attachment`);
    const result = asObj(res.body).result as Record<string, unknown> ?? {};
    return result;
  }

  if (operation === "getAll") {
    const tableName = String(resolveValue(node.parameters.tableName, itemJson) ?? "");
    const tableSysId = String(resolveValue(node.parameters.tableSysId, itemJson) ?? "");
    const params: Record<string, string> = {};
    if (tableName && tableSysId) {
      params.sysparm_query = `table_name=${tableName}^table_sys_id=${tableSysId}`;
    }
    const res = await snRequest(baseUrl, "GET", "attachment", headers, undefined, params);
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} querying attachments`);
    const results = (asObj(res.body).result as Record<string, unknown>[]) ?? [];
    return results;
  }

  if (operation === "delete") {
    const attachmentId = String(resolveValue(node.parameters.attachmentId, itemJson) ?? "");
    if (!attachmentId) throw new Error("ServiceNow: attachmentId is required for attachment delete");
    const res = await snRequest(baseUrl, "DELETE", `attachment/${encodeURIComponent(attachmentId)}`, headers);
    if (res.status === 404) throw new Error("ServiceNow: attachment not found");
    if (res.status < 200 || res.status >= 300) throw new Error(`ServiceNow: HTTP ${res.status} deleting attachment`);
    return { success: true };
  }

  if (operation === "upload") {
    const tableName = String(resolveValue(node.parameters.tableName, itemJson) ?? "");
    const tableSysId = String(resolveValue(node.parameters.tableSysId, itemJson) ?? "");
    if (!tableName || !tableSysId) throw new Error("ServiceNow: tableName and tableSysId are required for attachment upload");
    const inputBinaryField = String(node.parameters.inputBinaryField ?? "data");
    throw new Error(`ServiceNow: attachment upload requires binary data — not yet implemented (field: ${inputBinaryField}, table: ${tableName}, sysId: ${tableSysId})`);
  }

  throw new Error(`ServiceNow: unsupported attachment operation "${operation}"`);
}

import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (!raw.startsWith("=") && !/\{\{[\s\S]*?\}\}/.test(raw)) return raw;
  const result = evaluateExpression(raw, { json: itemJson });
  return result.ok ? result.value : raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

async function dynamicsRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
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
    } catch {}
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Dynamics CRM request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function processError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const message = typeof obj.message === "string" ? obj.message : `HTTP ${status}`;
  return new Error(`Dynamics CRM: ${message}`);
}

async function requestOk(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, unknown>> {
  const res = await dynamicsRequest(method, url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status);
  return asObj(res.body);
}

function hasUnresolvedFromAI(node: INode): boolean {
  const params = node.parameters;
  for (const value of Object.values(params)) {
    if (typeof value === "string" && value.includes("$fromAI(")) return true;
    if (value && typeof value === "object") {
      if (hasFromAIInObj(value as Record<string, unknown>)) return true;
    }
  }
  return false;
}

function hasFromAIInObj(obj: Record<string, unknown>): boolean {
  for (const value of Object.values(obj)) {
    if (typeof value === "string" && value.includes("$fromAI(")) return true;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (hasFromAIInObj(value as Record<string, unknown>)) return true;
    }
  }
  return false;
}

function buildApiBaseUrl(cred: Record<string, unknown>): string {
  const subdomain = String(cred.subdomain ?? "");
  const region = String(cred.region ?? "crm.dynamics.com");
  return `https://${subdomain}.${region}/api/data/v9.2`;
}

function buildPayloadFromFields(
  fields: Record<string, unknown> | undefined,
  itemJson: Record<string, unknown>,
  ...skipKeys: string[]
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (!fields || typeof fields !== "object") return body;
  const skip = new Set(skipKeys);
  for (const [key, value] of Object.entries(fields)) {
    if (skip.has(key)) continue;
    const resolved = resolveValue(value, itemJson);
    if (resolved !== undefined && resolved !== null && resolved !== "") {
      body[key] = resolved;
    }
  }
  return body;
}

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("microsoftDynamicsOAuth2Api");
  const token = cred ? String(cred.accessToken ?? cred.id_token ?? "") : "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    Prefer: "return=representation",
  };
}

export const microsoftDynamicsCrmExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "account");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  if (hasUnresolvedFromAI(node)) {
    return [items.map((item, idx) => ({
      json: { ...item.json as Record<string, unknown> },
      pairedItem: item.pairedItem ?? { item: idx, input: 0 },
    }))];
  }

  const headers = await authHeaders(ctx);
  const cred = await ctx.getCredential("microsoftDynamicsOAuth2Api");
  const apiBase = cred ? buildApiBaseUrl(cred) : "https://org.crm.dynamics.com/api/data/v9.2";

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(node, resource, operation, itemJson, headers, apiBase);
      for (const json of results) {
        out.push({ json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function runOperation(
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  apiBase: string,
): Promise<Record<string, unknown>[]> {
  if (resource !== "account") {
    throw new Error(`Dynamics CRM: unsupported resource "${resource}"`);
  }

  switch (operation) {
    case "create": return runCreate(node, itemJson, headers, apiBase);
    case "get": return runGet(node, itemJson, headers, apiBase);
    case "getAll": return runGetAll(node, itemJson, headers, apiBase);
    case "update": return runUpdate(node, itemJson, headers, apiBase);
    case "delete": return runDelete(node, itemJson, headers, apiBase);
    default: throw new Error(`Dynamics CRM: unsupported account operation "${operation}"`);
  }
}

async function runCreate(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  apiBase: string,
): Promise<Record<string, unknown>[]> {
  const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
  if (!name) throw new Error("Dynamics CRM: name is required for account create");

  const body: Record<string, unknown> = { name };
  const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
  if (additionalFields && typeof additionalFields === "object") {
    Object.assign(body, buildPayloadFromFields(additionalFields, itemJson, "addresses"));
    const addresses = (additionalFields as Record<string, unknown>).addresses as Record<string, unknown> | undefined;
    if (addresses && typeof addresses === "object") {
      const addrValues = addresses.values as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(addrValues) && addrValues.length > 0) {
        body.address1_line1 = resolveValue(addrValues[0].line1, itemJson);
        body.address1_line2 = resolveValue(addrValues[0].line2, itemJson);
        body.address1_line3 = resolveValue(addrValues[0].line3, itemJson);
        body.address1_city = resolveValue(addrValues[0].city, itemJson);
        body.address1_stateorprovince = resolveValue(addrValues[0].stateorprovince, itemJson);
        body.address1_postalcode = resolveValue(addrValues[0].postalcode, itemJson);
        body.address1_country = resolveValue(addrValues[0].country, itemJson);
        body.address1_name = resolveValue(addrValues[0].name, itemJson);
        body.address1_primarycontactname = resolveValue(addrValues[0].primarycontactname, itemJson);
        body.address1_telephone1 = resolveValue(addrValues[0].telephone1, itemJson);
        body.address1_telephone2 = resolveValue(addrValues[0].telephone2, itemJson);
        body.address1_fax = resolveValue(addrValues[0].fax, itemJson);
        body.address1_addresstypecode = resolveValue(addrValues[0].addresstypecode, itemJson);
      }
    }
  }

  const obj = await requestOk("POST", `${apiBase}/accounts`, headers, body);
  return [obj];
}

async function runGet(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  apiBase: string,
): Promise<Record<string, unknown>[]> {
  const accountId = String(resolveValue(node.parameters.accountId, itemJson) ?? "");
  if (!accountId) throw new Error("Dynamics CRM: accountId is required for account get");

  let url = `${apiBase}/accounts(${encodeURIComponent(accountId)})`;
  const options = node.parameters.options as Record<string, unknown> | undefined;
  if (options && typeof options === "object") {
    const queryParts: string[] = [];
    const returnFields = options.returnFields;
    if (Array.isArray(returnFields) && returnFields.length > 0) {
      queryParts.push(`$select=${returnFields.map(encodeURIComponent).join(",")}`);
    }
    const expandFields = options.expandFields;
    if (Array.isArray(expandFields) && expandFields.length > 0) {
      queryParts.push(`$expand=${expandFields.map(encodeURIComponent).join(",")}`);
    }
    if (queryParts.length > 0) {
      url += `?${queryParts.join("&")}`;
    }
  }

  const obj = await requestOk("GET", url, headers);
  return [obj];
}

async function runGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  apiBase: string,
): Promise<Record<string, unknown>[]> {
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(node.parameters.limit ?? 5);

  let url = `${apiBase}/accounts`;
  const queryParts: string[] = [];

  const filters = node.parameters.filters as Record<string, unknown> | undefined;
  if (filters && typeof filters === "object") {
    const query = String(resolveValue(filters.query, itemJson) ?? "");
    if (query) {
      queryParts.push(`$filter=${encodeURIComponent(query)}`);
    }
  }

  const options = node.parameters.options as Record<string, unknown> | undefined;
  if (options && typeof options === "object") {
    const returnFields = options.returnFields;
    if (Array.isArray(returnFields) && returnFields.length > 0) {
      queryParts.push(`$select=${returnFields.map(encodeURIComponent).join(",")}`);
    }
    const expandFields = options.expandFields;
    if (Array.isArray(expandFields) && expandFields.length > 0) {
      queryParts.push(`$expand=${expandFields.map(encodeURIComponent).join(",")}`);
    }
  }

  if (!returnAll) {
    queryParts.push(`$top=${Math.min(limit, 100)}`);
  }

  if (queryParts.length > 0) {
    url += `?${queryParts.join("&")}`;
  }

  const values: Record<string, unknown>[] = [];
  let nextLink: string | undefined;

  const firstObj = await requestOk("GET", url, headers);
  const firstValues = Array.isArray(firstObj.value) ? firstObj.value as Record<string, unknown>[] : [];
  values.push(...firstValues);
  nextLink = firstObj["@odata.nextLink"] as string | undefined;

  if (!returnAll && values.length > limit) {
    return values.slice(0, limit);
  }

  while (nextLink && returnAll) {
    const nextObj = await requestOk("GET", nextLink, headers);
    const nextValues = Array.isArray(nextObj.value) ? nextObj.value as Record<string, unknown>[] : [];
    values.push(...nextValues);
    nextLink = nextObj["@odata.nextLink"] as string | undefined;
  }

  return values;
}

async function runUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  apiBase: string,
): Promise<Record<string, unknown>[]> {
  const accountId = String(resolveValue(node.parameters.accountId, itemJson) ?? "");
  if (!accountId) throw new Error("Dynamics CRM: accountId is required for account update");

  const body = buildPayloadFromFields(node.parameters.updateFields as Record<string, unknown> | undefined, itemJson);
  if (Object.keys(body).length === 0) throw new Error("Dynamics CRM: updateFields is required for account update");

  const obj = await requestOk("PATCH", `${apiBase}/accounts(${encodeURIComponent(accountId)})`, headers, body);
  return [obj];
}

async function runDelete(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  apiBase: string,
): Promise<Record<string, unknown>[]> {
  const accountId = String(resolveValue(node.parameters.accountId, itemJson) ?? "");
  if (!accountId) throw new Error("Dynamics CRM: accountId is required for account delete");

  await requestOk("DELETE", `${apiBase}/accounts(${encodeURIComponent(accountId)})`, headers);
  return [{ ...itemJson }];
}

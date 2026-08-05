import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://{subdomain}.agilecrm.com/dev/api";

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

function resolveObject(obj: Record<string, unknown>, itemJson: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = resolveValue(value, itemJson);
  }
  return result;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function buildContactProperties(raw: unknown, itemJson: Record<string, unknown>): Array<Record<string, unknown>> {
  if (raw && typeof raw === "object" && "values" in (raw as Record<string, unknown>)) {
    const coll = raw as Record<string, unknown>;
    if (Array.isArray(coll.values)) {
      return coll.values.map((v: Record<string, unknown>) => ({
        type: v.type ?? "SYSTEM",
        name: String(resolveValue(v.fieldName ?? v.name, itemJson) ?? ""),
        value: resolveValue(v.fieldValue ?? v.value, itemJson) ?? "",
      }));
    }
  }
  if (Array.isArray(raw)) {
    return raw.map((v: Record<string, unknown>) => ({
      type: v.type ?? "SYSTEM",
      name: String(resolveValue(v.fieldName ?? v.name, itemJson) ?? ""),
      value: resolveValue(v.fieldValue ?? v.value, itemJson) ?? "",
    }));
  }
  return [];
}

function buildCustomFields(raw: unknown, itemJson: Record<string, unknown>): Array<Record<string, unknown>> {
  if (raw && typeof raw === "object" && "values" in (raw as Record<string, unknown>)) {
    const coll = raw as Record<string, unknown>;
    if (Array.isArray(coll.values)) {
      return coll.values.map((v: Record<string, unknown>) => ({
        name: String(resolveValue(v.name, itemJson) ?? ""),
        value: resolveValue(v.value, itemJson) ?? "",
      }));
    }
  }
  return [];
}

interface OpResult {
  json: Record<string, unknown>;
}

type OpResultList = OpResult | OpResult[];

export const agileCrmExecutor: NodeExecutor = async (ctx, node) => {
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
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return [out];
};

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("agileCrmApi");
  if (!cred) throw new Error("Agile CRM: agileCrmApi credential is required");

  const data = cred as Record<string, unknown>;
  const email = String(data.email ?? "");
  const apiKey = String(data.apiKey ?? "");
  const subdomain = String(data.subdomain ?? "");
  if (!email || !apiKey) throw new Error("Agile CRM: email and apiKey are required in agileCrmApi credential");
  const token = Buffer.from(`${email}:${apiKey}`).toString("base64");

  return {
    Authorization: `Basic ${token}`,
    subdomain,
  };
}

function getApiBase(auth: Record<string, string>): string {
  const subdomain = auth.subdomain ?? "agilecrm";
  return `https://${subdomain}.agilecrm.com/dev/api`;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const auth = await getAuthHeaders(ctx);

  switch (resource) {
    case "company": return runCompanyOperation(node, operation, itemJson, auth);
    case "contact": return runContactOperation(node, operation, itemJson, auth);
    case "deal": return runDealOperation(node, operation, itemJson, auth);
    default: throw new Error(`Agile CRM: unsupported resource "${resource}"`);
  }
}

async function apiRequest(
  method: string,
  path: string,
  auth: Record<string, string>,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const base = getApiBase(auth);
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${base}${path}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      Authorization: auth.Authorization,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }

    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed as Record<string, unknown>);
      const errMsg = (obj.message as string) ?? (obj.error as string) ?? `Agile CRM API error: ${response.status}`;
      const err = new Error(errMsg);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return asObj(parsed as Record<string, unknown>);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

async function runCompanyOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "create") {
    const rawParams = node.parameters.jsonParameters;
    const properties = buildContactProperties(rawParams, itemJson);
    const requestBody: Record<string, unknown> = {};
    if (properties.length > 0) {
      for (const p of properties) {
        requestBody[p.name as string] = p.value;
      }
    }
    const res = await apiRequest("POST", "/crm/company", auth, requestBody);
    return { json: res };
  }

  if (operation === "delete") {
    const companyId = String(resolveValue(node.parameters.companyId, itemJson) ?? "");
    if (!companyId) throw new Error("Agile CRM: companyId is required for company delete");
    await apiRequest("DELETE", `/crm/company/${companyId}`, auth);
    return { json: { ...itemJson } as Record<string, unknown> };
  }

  if (operation === "get") {
    const companyId = String(resolveValue(node.parameters.companyId, itemJson) ?? "");
    if (!companyId) throw new Error("Agile CRM: companyId is required for company get");
    const res = await apiRequest("GET", `/crm/company/${companyId}`, auth);
    return { json: res };
  }

  if (operation === "getAll") {
    const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 100);
    const returnAll = Boolean(resolveValue(node.parameters.returnAll, itemJson) ?? false);
    const filterType = "all";
    const reqBody = {
      filterType,
      limit: returnAll ? 1000000 : limit,
    };
    const res = await apiRequest("POST", "/crm/company/paginate", auth, reqBody);
    const data = res.data ?? [];
    const list = Array.isArray(data) ? data : [];
    if (returnAll) {
      return { json: list };
    }
    return list.map((r: Record<string, unknown>) => ({ json: r }));
  }

  if (operation === "update") {
    const companyId = String(resolveValue(node.parameters.companyId, itemJson) ?? "");
    if (!companyId) throw new Error("Agile CRM: companyId is required for company update");
    const rawParams = node.parameters.jsonParameters;
    const properties = buildContactProperties(rawParams, itemJson);
    const requestBody: Record<string, unknown> = { id: companyId };
    if (properties.length > 0) {
      for (const p of properties) {
        requestBody[p.name as string] = p.value;
      }
    }
    const res = await apiRequest("PUT", "/crm/company", auth, requestBody);
    return { json: res };
  }

  throw new Error(`Agile CRM: unsupported company operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

async function runContactOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "create") {
    const rawParams = node.parameters.contactJsonParameters;
    const properties = buildContactProperties(rawParams, itemJson);
    const requestBody: Record<string, unknown> = properties.length > 0
      ? { properties }
      : {};
    const res = await apiRequest("POST", "/crm/contact", auth, requestBody);
    return { json: res };
  }

  if (operation === "delete") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("Agile CRM: contactId is required for contact delete");
    await apiRequest("DELETE", `/crm/contact/${contactId}`, auth);
    return { json: { ...itemJson } as Record<string, unknown> };
  }

  if (operation === "get") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("Agile CRM: contactId is required for contact get");
    const res = await apiRequest("GET", `/crm/contact/${contactId}`, auth);
    return { json: res };
  }

  if (operation === "getAll") {
    const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 100);
    const returnAll = Boolean(resolveValue(node.parameters.returnAll, itemJson) ?? false);
    const filterType = "all";
    const reqBody = {
      filterType,
      limit: returnAll ? 1000000 : limit,
    };
    const res = await apiRequest("POST", "/crm/contact/paginate", auth, reqBody);
    const data = res.data ?? [];
    const list = Array.isArray(data) ? data : [];
    if (returnAll) {
      return { json: list };
    }
    return list.map((r: Record<string, unknown>) => ({ json: r }));
  }

  if (operation === "update") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("Agile CRM: contactId is required for contact update");
    const rawParams = node.parameters.contactJsonParameters;
    const properties = buildContactProperties(rawParams, itemJson);
    const requestBody: Record<string, unknown> = { id: contactId };
    if (properties.length > 0) {
      requestBody.properties = properties;
    }
    const res = await apiRequest("PUT", "/crm/contact", auth, requestBody);
    return { json: res };
  }

  throw new Error(`Agile CRM: unsupported contact operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Deal
// ---------------------------------------------------------------------------

async function runDealOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "create") {
    const requestBody: Record<string, unknown> = {};
    const name = resolveValue(node.parameters.name, itemJson);
    if (name !== undefined && name !== null && name !== "") {
      requestBody.name = String(name);
    }
    const expectedValue = resolveValue(node.parameters.expectedValue, itemJson);
    if (expectedValue !== undefined && expectedValue !== null && expectedValue !== "") {
      requestBody.expected_value = Number(expectedValue);
    }
    const probability = resolveValue(node.parameters.probability, itemJson);
    if (probability !== undefined && probability !== null && probability !== "") {
      requestBody.probability = Number(probability);
    }
    const closeDate = resolveValue(node.parameters.closeDate, itemJson);
    if (closeDate !== undefined && closeDate !== null && closeDate !== "") {
      requestBody.close_date = Number(closeDate);
    }
    const milestone = resolveValue(node.parameters.milestone, itemJson);
    if (milestone !== undefined && milestone !== null && milestone !== "") {
      requestBody.milestone = String(milestone);
    }
    const contactIds = resolveValue(node.parameters.contactIds, itemJson);
    if (contactIds !== undefined && contactIds !== null) {
      requestBody.contactIds = contactIds;
    }
    const customProperties = buildCustomFields(node.parameters.customProperties, itemJson);
    if (customProperties.length > 0) {
      requestBody.customData = customProperties;
    }
    const res = await apiRequest("POST", "/crm/deal", auth, requestBody);
    return { json: res };
  }

  if (operation === "delete") {
    const dealId = String(resolveValue(node.parameters.dealId, itemJson) ?? "");
    if (!dealId) throw new Error("Agile CRM: dealId is required for deal delete");
    await apiRequest("DELETE", `/crm/deal/${dealId}`, auth);
    return { json: { ...itemJson } as Record<string, unknown> };
  }

  if (operation === "get") {
    const dealId = String(resolveValue(node.parameters.dealId, itemJson) ?? "");
    if (!dealId) throw new Error("Agile CRM: dealId is required for deal get");
    const res = await apiRequest("GET", `/crm/deal/${dealId}`, auth);
    return { json: res };
  }

  if (operation === "getAll") {
    const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 100);
    const returnAll = Boolean(resolveValue(node.parameters.returnAll, itemJson) ?? false);
    const filterType = "all";
    const reqBody = {
      filterType,
      limit: returnAll ? 1000000 : limit,
    };
    const res = await apiRequest("POST", "/crm/deal/paginate", auth, reqBody);
    const data = res.data ?? [];
    const list = Array.isArray(data) ? data : [];
    if (returnAll) {
      return { json: list };
    }
    return list.map((r: Record<string, unknown>) => ({ json: r }));
  }

  if (operation === "update") {
    const dealId = String(resolveValue(node.parameters.dealId, itemJson) ?? "");
    if (!dealId) throw new Error("Agile CRM: dealId is required for deal update");
    const requestBody: Record<string, unknown> = { id: dealId };
    const name = resolveValue(node.parameters.name, itemJson);
    if (name !== undefined && name !== null && name !== "") {
      requestBody.name = String(name);
    }
    const expectedValue = resolveValue(node.parameters.expectedValue, itemJson);
    if (expectedValue !== undefined && expectedValue !== null && expectedValue !== "") {
      requestBody.expected_value = Number(expectedValue);
    }
    const probability = resolveValue(node.parameters.probability, itemJson);
    if (probability !== undefined && probability !== null && probability !== "") {
      requestBody.probability = Number(probability);
    }
    const closeDate = resolveValue(node.parameters.closeDate, itemJson);
    if (closeDate !== undefined && closeDate !== null && closeDate !== "") {
      requestBody.close_date = Number(closeDate);
    }
    const milestone = resolveValue(node.parameters.milestone, itemJson);
    if (milestone !== undefined && milestone !== null && milestone !== "") {
      requestBody.milestone = String(milestone);
    }
    const contactIds = resolveValue(node.parameters.contactIds, itemJson);
    if (contactIds !== undefined && contactIds !== null) {
      requestBody.contactIds = contactIds;
    }
    const customProperties = buildCustomFields(node.parameters.customProperties, itemJson);
    if (customProperties.length > 0) {
      requestBody.customData = customProperties;
    }
    const res = await apiRequest("PUT", "/crm/deal", auth, requestBody);
    return { json: res };
  }

  throw new Error(`Agile CRM: unsupported deal operation "${operation}"`);
}

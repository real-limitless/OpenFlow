import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.tapfiliate.com/1.6";

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

export const tapfiliateExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "affiliate");
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
        out.push({ json: r, pairedItem });
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
  const cred = await ctx.getCredential("tapfiliateApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("Tapfiliate: tapfiliateApi credential is not configured");
  }
  return apiKey;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (resource) {
    case "affiliate":
      return runAffiliateOperation(ctx, node, operation, itemJson);
    case "affiliateMetadata":
      return runAffiliateMetadataOperation(ctx, node, operation, itemJson);
    case "programAffiliate":
      return runProgramAffiliateOperation(ctx, node, operation, itemJson);
    default:
      throw new Error(`Tapfiliate: unsupported resource "${resource}"`);
  }
}

async function apiRequest(
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = params
    ? `${API_BASE}${path}?${new URLSearchParams(params).toString()}`
    : `${API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json; charset=utf-8",
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    if (response.status === 204) return {};
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = String(obj.message ?? obj.error ?? `Tapfiliate API error: ${response.status}`);
      throw new Error(errMsg);
    }
    if (parsed === null || parsed === "") return {};
    return asObj(parsed);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Tapfiliate")) throw err;
    throw new Error(`Tapfiliate request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function apiRequestList(
  apiKey: string,
  path: string,
  params?: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const res = await apiRequest(apiKey, "GET", path, undefined, params);
  const items = (res.data ?? res.results ?? []) as Record<string, unknown>[];
  return items;
}

// -- Affiliate --
async function runAffiliateOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const apiKey = await getApiKey(ctx);

  if (operation === "create") {
    const body: Record<string, unknown> = {};
    const email = resolveValue(node.parameters.email, itemJson);
    if (email) body.email = email;
    const firstname = resolveValue(node.parameters.firstname, itemJson);
    if (firstname) body.firstname = firstname;
    const lastname = resolveValue(node.parameters.lastname, itemJson);
    if (lastname) body.lastname = lastname;
    const companyName = resolveValue(node.parameters.additionalFields?.companyName, itemJson);
    if (companyName) body.companyName = companyName;
    const addressUi = resolveValue(node.parameters.additionalFields?.addressUi, itemJson);
    if (addressUi && typeof addressUi === "object") {
      const addr = addressUi as Record<string, unknown>;
      const address: Record<string, unknown> = {};
      if (addr.street) address.street = addr.street;
      if (addr.city) address.city = addr.city;
      if (addr.state) address.state = addr.state;
      if (addr.zip) address.zip = addr.zip;
      if (addr.country) address.country = addr.country;
      if (Object.keys(address).length > 0) body.address = address;
    }
    return apiRequest(apiKey, "POST", "/affiliates/", body);
  }

  if (operation === "get") {
    const affiliateId = String(resolveValue(node.parameters.affiliateId, itemJson) ?? "");
    if (!affiliateId) throw new Error("Tapfiliate: affiliateId is required for get");
    return apiRequest(apiKey, "GET", `/affiliates/${affiliateId}/`);
  }

  if (operation === "getAll") {
    const params: Record<string, string> = {};
    const returnAll = node.parameters.returnAll === true;
    if (!returnAll) {
      params.page = "1";
    }
    const limit = Number(node.parameters.limit ?? 50);
    params.limit = String(limit);
    const filters = node.parameters.filters as Record<string, string> | undefined;
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value) params[key] = String(value);
      }
    }
    const data = await apiRequestList(apiKey, "/affiliates/", params);
    return data;
  }

  if (operation === "delete") {
    const affiliateId = String(resolveValue(node.parameters.affiliateId, itemJson) ?? "");
    if (!affiliateId) throw new Error("Tapfiliate: affiliateId is required for delete");
    await apiRequest(apiKey, "DELETE", `/affiliates/${affiliateId}/`);
    return {};
  }

  throw new Error(`Tapfiliate: unsupported affiliate operation "${operation}"`);
}

// -- Affiliate Metadata --
async function runAffiliateMetadataOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const apiKey = await getApiKey(ctx);
  const affiliateId = String(resolveValue(node.parameters.affiliateId, itemJson) ?? "");
  if (!affiliateId) throw new Error("Tapfiliate: affiliateId is required for metadata operations");

  if (operation === "add") {
    const metadataUi = node.parameters.metadataUi as { metadataValues?: Array<{ key: string; value: string }> } | undefined;
    const entries = metadataUi?.metadataValues ?? [];
    const body: Record<string, string> = {};
    for (const entry of entries) {
      if (entry.key) body[entry.key] = entry.value ?? "";
    }
    return apiRequest(apiKey, "PUT", `/affiliates/${affiliateId}/meta-data/`, body);
  }

  if (operation === "remove") {
    const key = String(resolveValue(node.parameters.key, itemJson) ?? "");
    if (!key) throw new Error("Tapfiliate: key is required for metadata remove");
    await apiRequest(apiKey, "DELETE", `/affiliates/${affiliateId}/meta-data/${key}/`);
    return {};
  }

  if (operation === "update") {
    const key = String(resolveValue(node.parameters.key, itemJson) ?? "");
    if (!key) throw new Error("Tapfiliate: key is required for metadata update");
    const value = String(resolveValue(node.parameters.value, itemJson) ?? "");
    const body = { value };
    return apiRequest(apiKey, "PUT", `/affiliates/${affiliateId}/meta-data/${key}/`, body);
  }

  throw new Error(`Tapfiliate: unsupported affiliateMetadata operation "${operation}"`);
}

// -- Program Affiliate --
async function runProgramAffiliateOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const apiKey = await getApiKey(ctx);
  const programId = String(resolveValue(node.parameters.programId, itemJson) ?? "");
  if (!programId) throw new Error("Tapfiliate: programId is required for program affiliate operations");
  const affiliateId = String(resolveValue(node.parameters.affiliateId, itemJson) ?? "");
  if (!affiliateId) throw new Error("Tapfiliate: affiliateId is required for program affiliate operations");

  if (operation === "add") {
    const body: Record<string, unknown> = { affiliate: affiliateId };
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    if (additionalFields?.approved !== undefined) body.approved = additionalFields.approved;
    if (additionalFields?.coupon) body.coupon = additionalFields.coupon;
    return apiRequest(apiKey, "POST", `/programs/${programId}/affiliates/`, body);
  }

  if (operation === "approve") {
    return apiRequest(apiKey, "PUT", `/programs/${programId}/affiliates/${affiliateId}/approve/`);
  }

  if (operation === "disapprove") {
    await apiRequest(apiKey, "DELETE", `/programs/${programId}/affiliates/${affiliateId}/approve/`);
    return {};
  }

  if (operation === "get") {
    return apiRequest(apiKey, "GET", `/programs/${programId}/affiliates/${affiliateId}/`);
  }

  if (operation === "getAll") {
    const params: Record<string, string> = {};
    const returnAll = node.parameters.returnAll === true;
    if (!returnAll) {
      params.page = "1";
    }
    const limit = Number(node.parameters.limit ?? 50);
    params.limit = String(limit);
    const filters = node.parameters.filters as Record<string, string> | undefined;
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value) params[key] = String(value);
      }
    }
    const data = await apiRequestList(apiKey, `/programs/${programId}/affiliates/`, params);
    return data;
  }

  throw new Error(`Tapfiliate: unsupported programAffiliate operation "${operation}"`);
}

import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems, withPairedItem } from "@/sdk";

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

function nonEmptyData(data: unknown): Record<string, unknown> | null {
  if (data && typeof data === "object" && !Array.isArray(data) && Object.keys(data as Record<string, unknown>).length > 0) {
    return data as Record<string, unknown>;
  }
  return null;
}

function resolveJsonField(raw: unknown, itemJson: Record<string, unknown>): Record<string, unknown> {
  if (typeof raw === "string") {
    const resolved = resolveValue(raw, itemJson);
    if (typeof resolved === "string") {
      try { return JSON.parse(resolved); } catch { return {}; }
    }
    if (resolved && typeof resolved === "object") return resolved as Record<string, unknown>;
    return {};
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

async function apiRequest(
  baseUrl: string,
  method: string,
  endpoint: string,
  body: unknown,
  credentials: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const password = String(credentials.password ?? "");
  const username = String(credentials.user ?? credentials.username ?? "");
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const url = `${baseUrl.replace(/\/$/, "")}/api${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: authHeader,
    Accept: "application/json",
  };
  let fetchBody: string | undefined;
  if (body !== undefined && method !== "GET" && method !== "DELETE") {
    headers["Content-Type"] = "application/json";
    fetchBody = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method,
    headers,
    body: fetchBody,
  });

  let data: unknown;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  } else {
    data = null;
  }

  if (!res.ok && res.status >= 400) {
    const msg = (data && typeof data === "object" && !Array.isArray(data))
      ? String((data as Record<string, unknown>).message ?? (data as Record<string, unknown>).error ?? res.statusText)
      : `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(msg);
  }

  return { status: res.status, data };
}

export const mauticExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "contact");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  const creds = await ctx.getCredential("mauticApi");
  const oauthCreds = await ctx.getCredential("mauticOAuth2Api");
  const credential = creds ?? oauthCreds;
  if (!credential) {
    throw new Error("mauticApi or mauticOAuth2Api credential is not configured");
  }

  const baseUrl = String(credential.url ?? "").replace(/\/$/, "");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await executeOperation(resource, operation, node.parameters, itemJson, baseUrl, credential);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r, pairedItem });
      }
    } catch (e) {
      if (continueOnFail) {
        out.push({
          json: {
            error: true,
            message: (e as Error).message ?? String(e),
          },
          pairedItem,
        });
      } else {
        throw e;
      }
    }
  }

  return [out];
};

async function executeOperation(
  resource: string,
  operation: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  creds: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (resource) {
    case "campaignContact": {
      const campaignId = String(resolveValue(params.campaignId, itemJson) ?? "");
      const contactId = String(resolveValue(params.contactId, itemJson) ?? "");
      if (!campaignId) throw new Error("campaignId is required");
      if (!contactId) throw new Error("contactId is required");
      if (operation === "add") {
        const { data } = await apiRequest(baseUrl, "POST", `/campaigns/${campaignId}/contact/${contactId}/add`, undefined, creds);
        return nonEmptyData(data) ?? { success: true };
      } else {
        const { data } = await apiRequest(baseUrl, "POST", `/campaigns/${campaignId}/contact/${contactId}/remove`, undefined, creds);
        return nonEmptyData(data) ?? { success: true };
      }
    }
    case "company": {
      if (operation === "create") {
        const fields = resolveJsonField(params.requestFields, itemJson);
        const { data } = await apiRequest(baseUrl, "POST", "/companies/new", fields, creds);
        return (data as Record<string, unknown>)?.company ?? (data as Record<string, unknown>) ?? {};
      }
      if (operation === "get") {
        const companyId = String(resolveValue(params.companyId, itemJson) ?? "");
        if (!companyId) throw new Error("companyId is required");
        const { data } = await apiRequest(baseUrl, "GET", `/companies/${companyId}`, undefined, creds);
        return (data as Record<string, unknown>)?.company ?? {};
      }
      if (operation === "getAll") {
        const query = resolveJsonField(params.queryOptions, itemJson);
        const qs = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
        const { data } = await apiRequest(baseUrl, "GET", `/companies${qs ? "?" + qs : ""}`, undefined, creds);
        return { total: (data as Record<string, unknown>)?.total ?? 0, companies: (data as Record<string, unknown>)?.companies ?? {} };
      }
      if (operation === "update") {
        const companyId = String(resolveValue(params.companyId, itemJson) ?? "");
        if (!companyId) throw new Error("companyId is required");
        const fields = resolveJsonField(params.requestFields, itemJson);
        const { data } = await apiRequest(baseUrl, "PATCH", `/companies/${companyId}/edit`, fields, creds);
        return (data as Record<string, unknown>)?.company ?? {};
      }
      if (operation === "delete") {
        const companyId = String(resolveValue(params.companyId, itemJson) ?? "");
        if (!companyId) throw new Error("companyId is required");
        const { data } = await apiRequest(baseUrl, "DELETE", `/companies/${companyId}/delete`, undefined, creds);
        return (data && typeof data === "object" && !Array.isArray(data) && "company" in (data as Record<string, unknown>))
          ? ((data as Record<string, unknown>).company as Record<string, unknown>)
          : (data as Record<string, unknown>) || { success: true };
      }
      throw new Error(`Unsupported operation ${operation} for company`);
    }
    case "companyContact": {
      const companyId = String(resolveValue(params.companyId, itemJson) ?? "");
      const contactId = String(resolveValue(params.contactId, itemJson) ?? "");
      if (!companyId) throw new Error("companyId is required");
      if (!contactId) throw new Error("contactId is required");
      if (operation === "add") {
        const { data } = await apiRequest(baseUrl, "POST", `/companies/${companyId}/contact/${contactId}/add`, undefined, creds);
        return nonEmptyData(data) ?? { success: true };
      } else {
        const { data } = await apiRequest(baseUrl, "POST", `/companies/${companyId}/contact/${contactId}/remove`, undefined, creds);
        return nonEmptyData(data) ?? { success: true };
      }
    }
    case "contact": {
      if (operation === "create") {
        const fields = resolveJsonField(params.requestFields, itemJson);
        const { data } = await apiRequest(baseUrl, "POST", "/contacts/new", fields, creds);
        return (data as Record<string, unknown>)?.contact ?? (data as Record<string, unknown>) ?? {};
      }
      if (operation === "get") {
        const contactId = String(resolveValue(params.contactId, itemJson) ?? "");
        if (!contactId) throw new Error("contactId is required");
        const { data } = await apiRequest(baseUrl, "GET", `/contacts/${contactId}`, undefined, creds);
        return (data as Record<string, unknown>)?.contact ?? {};
      }
      if (operation === "getAll") {
        const query = resolveJsonField(params.queryOptions, itemJson);
        const qs = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
        const { data } = await apiRequest(baseUrl, "GET", `/contacts${qs ? "?" + qs : ""}`, undefined, creds);
        return { total: (data as Record<string, unknown>)?.total ?? 0, contacts: (data as Record<string, unknown>)?.contacts ?? {} };
      }
      if (operation === "update") {
        const contactId = String(resolveValue(params.contactId, itemJson) ?? "");
        if (!contactId) throw new Error("contactId is required");
        const fields = resolveJsonField(params.requestFields, itemJson);
        const { data } = await apiRequest(baseUrl, "PATCH", `/contacts/${contactId}/edit`, fields, creds);
        return (data as Record<string, unknown>)?.contact ?? {};
      }
      if (operation === "delete") {
        const contactId = String(resolveValue(params.contactId, itemJson) ?? "");
        if (!contactId) throw new Error("contactId is required");
        const { data } = await apiRequest(baseUrl, "DELETE", `/contacts/${contactId}/delete`, undefined, creds);
        return (data && typeof data === "object" && !Array.isArray(data) && "contact" in (data as Record<string, unknown>))
          ? ((data as Record<string, unknown>).contact as Record<string, unknown>)
          : (data as Record<string, unknown>) || { success: true };
      }
      if (operation === "editPoints") {
        const contactId = String(resolveValue(params.contactId, itemJson) ?? "");
        const delta = Number(resolveValue(params.pointDelta, itemJson)) ?? 0;
        if (!contactId) throw new Error("contactId is required");
        const { data } = await apiRequest(baseUrl, "POST", `/contacts/${contactId}/points/${delta}/plus`, undefined, creds);
        return nonEmptyData(data) ?? { success: true };
      }
      if (operation === "manageDnc") {
        const contactId = String(resolveValue(params.contactId, itemJson) ?? "");
        const action = String(params.dncAction ?? "add");
        const channel = String(params.dncChannel ?? "email");
        if (!contactId) throw new Error("contactId is required");
        const endpoint = action === "add"
          ? `/contacts/${contactId}/dnc/${channel}/add`
          : `/contacts/${contactId}/dnc/${channel}/remove`;
        const { data } = await apiRequest(baseUrl, "POST", endpoint, undefined, creds);
        return (data as Record<string, unknown>) || { success: true };
      }
      if (operation === "sendEmail") {
        const contactId = String(resolveValue(params.contactId, itemJson) ?? "");
        const emailId = String(resolveValue(params.emailId, itemJson) ?? "");
        if (!contactId) throw new Error("contactId is required");
        if (!emailId) throw new Error("emailId is required");
        const { data } = await apiRequest(baseUrl, "POST", `/contacts/${contactId}/email/${emailId}`, undefined, creds);
        return (data as Record<string, unknown>) || { success: true };
      }
      throw new Error(`Unsupported operation ${operation} for contact`);
    }
    case "contactSegment": {
      const segmentId = String(resolveValue(params.segmentId, itemJson) ?? "");
      const contactId = String(resolveValue(params.contactId, itemJson) ?? "");
      if (!segmentId) throw new Error("segmentId is required");
      if (!contactId) throw new Error("contactId is required");
      if (operation === "add") {
        const { data } = await apiRequest(baseUrl, "POST", `/segments/${segmentId}/contact/${contactId}/add`, undefined, creds);
        return (data as Record<string, unknown>) || { success: true };
      } else {
        const { data } = await apiRequest(baseUrl, "POST", `/segments/${segmentId}/contact/${contactId}/remove`, undefined, creds);
        return (data as Record<string, unknown>) || { success: true };
      }
    }
    case "segmentEmail": {
      const segmentId = String(resolveValue(params.segmentId, itemJson) ?? "");
      const emailId = String(resolveValue(params.emailId, itemJson) ?? "");
      if (!segmentId) throw new Error("segmentId is required");
      if (!emailId) throw new Error("emailId is required");
      if (operation === "send") {
        const { data } = await apiRequest(baseUrl, "POST", `/emails/${emailId}/segment/${segmentId}`, undefined, creds);
        return (data as Record<string, unknown>) || { success: true, sentCount: 0, failedCount: 0 };
      }
      throw new Error(`Unsupported operation ${operation} for segmentEmail`);
    }
    default:
      throw new Error(`Unsupported resource: ${resource}`);
  }
}

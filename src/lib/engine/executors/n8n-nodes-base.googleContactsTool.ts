import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const PEOPLE_API = "https://people.googleapis.com/v1";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveLocator(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return String((resolved as Record<string, unknown>).value ?? "").trim();
  }
  return String(resolved ?? "").trim();
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function buildQuery(params: Record<string, string | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

function parseJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

async function getAccessToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("googleContactsOAuth2Api");
  if (!cred) {
    throw new Error("GoogleContactsTool: googleContactsOAuth2Api credential is not configured");
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error("GoogleContactsTool: googleContactsOAuth2Api has no accessToken");
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const errObj = asObj(parsed);
    const msg =
      (errObj.error as { message?: string } | undefined)?.message ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleContactsTool: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

async function contactCreate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  const names = parseJsonArray(resolveValue(node.parameters.names, itemJson));
  if (names.length) body.names = names;
  const emailAddresses = parseJsonArray(resolveValue(node.parameters.emailAddresses, itemJson));
  if (emailAddresses.length) body.emailAddresses = emailAddresses;
  const phoneNumbers = parseJsonArray(resolveValue(node.parameters.phoneNumbers, itemJson));
  if (phoneNumbers.length) body.phoneNumbers = phoneNumbers;
  if (!body.names && !body.emailAddresses && !body.phoneNumbers) {
    throw new Error("GoogleContactsTool: at least one contact field (names, emailAddresses, phoneNumbers) is required for create");
  }
  const qs = buildQuery({ personFields: "names,emailAddresses,phoneNumbers" });
  const url = `${PEOPLE_API}/people:createContact${qs}`;
  const res = await apiRequest("POST", url, token, body);
  return asObj(res.body);
}

async function contactDelete(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const resourceName = resolveLocator(node.parameters.contactId ?? itemJson.contactId, itemJson);
  if (!resourceName) throw new Error("GoogleContactsTool: contactId is required for delete");
  const url = `${PEOPLE_API}/${encodeURIComponent(resourceName)}`;
  await apiRequest("DELETE", url, token);
  return {};
}

async function contactGet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const resourceName = resolveLocator(node.parameters.contactId ?? itemJson.contactId, itemJson);
  if (!resourceName) throw new Error("GoogleContactsTool: contactId is required for get");
  const personFields = String(resolveValue(node.parameters.personFields, itemJson) ?? "names,emailAddresses,phoneNumbers");
  const qs = buildQuery({ personFields });
  const url = `${PEOPLE_API}/${encodeURIComponent(resourceName)}${qs}`;
  const res = await apiRequest("GET", url, token);
  return asObj(res.body);
}

async function contactGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(node.parameters.maxResults ?? 50);
  const personFields = String(resolveValue(node.parameters.personFields, itemJson) ?? "names,emailAddresses,phoneNumbers");
  const sortOrder = String(resolveValue(node.parameters.sortOrder, itemJson) ?? "LAST_MODIFIED_DESCENDING");

  const baseQs: Record<string, string | undefined> = {
    personFields,
    sortOrder,
  };

  const results: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  const pageSize = returnAll ? 100 : Math.min(Math.max(limit, 1), 100);

  do {
    const qs: Record<string, string | undefined> = {
      ...baseQs,
      pageSize: String(returnAll ? pageSize : Math.min(limit - results.length, pageSize)),
      pageToken,
    };
    const url = `${PEOPLE_API}/people/me/connections${buildQuery(qs)}`;
    const res = await apiRequest("GET", url, token);
    const body = asObj(res.body);
    const connections = (Array.isArray(body.connections) ? body.connections : []) as Record<string, unknown>[];
    for (const c of connections) {
      results.push(c);
      if (!returnAll && results.length >= limit) break;
    }
    pageToken = returnAll ? String(body.nextPageToken ?? "") || undefined : undefined;
    if (!returnAll && results.length >= limit) break;
  } while (pageToken);

  return results;
}

async function contactUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const resourceName = resolveLocator(node.parameters.contactId ?? itemJson.contactId, itemJson);
  if (!resourceName) throw new Error("GoogleContactsTool: contactId is required for update");

  const body: Record<string, unknown> = {};
  const names = parseJsonArray(resolveValue(node.parameters.names, itemJson));
  if (names.length) body.names = names;
  const emailAddresses = parseJsonArray(resolveValue(node.parameters.emailAddresses, itemJson));
  if (emailAddresses.length) body.emailAddresses = emailAddresses;
  const phoneNumbers = parseJsonArray(resolveValue(node.parameters.phoneNumbers, itemJson));
  if (phoneNumbers.length) body.phoneNumbers = phoneNumbers;
  if (!body.names && !body.emailAddresses && !body.phoneNumbers) {
    throw new Error("GoogleContactsTool: at least one field to update is required");
  }

  const etag = String(resolveValue(node.parameters.etag, itemJson) ?? "");
  if (etag) body.etag = etag;

  const personFields: string[] = [];
  if (body.names) personFields.push("names");
  if (body.emailAddresses) personFields.push("emailAddresses");
  if (body.phoneNumbers) personFields.push("phoneNumbers");
  const qs = buildQuery({ personFields: personFields.join(","), updatePersonFields: personFields.join(",") });

  const url = `${PEOPLE_API}/${encodeURIComponent(resourceName)}:updateContact${qs}`;
  const res = await apiRequest("PATCH", url, token, body);
  return asObj(res.body);
}

export const googleContactsToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(
    node.parameters.resource ?? ctx.getParam("resource", "contact") ?? "contact",
  );
  const operation = String(
    node.parameters.operation ?? ctx.getParam("operation", "create") ?? "create",
  );
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const token = await getAccessToken(ctx);
      if (resource === "contact") {
        if (operation === "create") {
          out.push({ json: await contactCreate(node, itemJson, token), pairedItem });
        } else if (operation === "delete") {
          out.push({ json: await contactDelete(node, itemJson, token), pairedItem });
        } else if (operation === "get") {
          out.push({ json: await contactGet(node, itemJson, token), pairedItem });
        } else if (operation === "getAll") {
          const contacts = await contactGetAll(node, itemJson, token);
          for (const c of contacts) {
            out.push({ json: c, pairedItem });
          }
        } else if (operation === "update") {
          out.push({ json: await contactUpdate(node, itemJson, token), pairedItem });
        } else {
          throw new Error(`GoogleContactsTool: unsupported contact operation "${operation}"`);
        }
      } else {
        throw new Error(`GoogleContactsTool: unsupported resource "${resource}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

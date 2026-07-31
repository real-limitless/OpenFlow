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

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(
    node.parameters.authentication ?? ctx.getParam("authentication", "oAuth2") ?? "oAuth2",
  );
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleContactsOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleContacts: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleContacts: ${credName} has no accessToken`);
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
    throw new Error(`GoogleContacts: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

export const googleContactsExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? ctx.getParam("resource", "contact") ?? "contact");
  const operation = String(node.parameters.operation ?? ctx.getParam("operation", "create") ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(results) ? results : [results];
      for (const json of list) {
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
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getAccessToken(ctx, node);

  switch (operation) {
    case "create":
      return handleCreate(token, node, itemJson);
    case "delete":
      return handleDelete(token, node, itemJson);
    case "get":
      return handleGet(token, node, itemJson);
    case "getAll":
      return handleGetAll(token, node, itemJson);
    case "update":
      return handleUpdate(token, node, itemJson);
    default:
      throw new Error(`GoogleContacts: Unknown operation "${operation}"`);
  }
}

function buildContactBody(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  const givenName = resolveLocator(node.parameters.givenName ?? "", itemJson);
  const familyName = resolveLocator(node.parameters.familyName ?? "", itemJson);
  if (givenName || familyName) {
    const name: Record<string, unknown> = {};
    if (givenName) name.givenName = givenName;
    if (familyName) name.familyName = familyName;
    body.names = [name];
  }

  const phoneNumbers = asRecord(node.parameters.phoneNumbers ?? {}).phoneNumberValues as
    | Array<{ type?: string; value?: string }>
    | undefined;
  if (phoneNumbers && phoneNumbers.length > 0) {
    body.phoneNumbers = phoneNumbers.map((p) => ({
      type: p.type ?? "other",
      value: resolveLocator(p.value, itemJson),
    }));
  }

  const emailAddresses = asRecord(node.parameters.emailAddresses ?? {}).emailValues as
    | Array<{ type?: string; value?: string }>
    | undefined;
  if (emailAddresses && emailAddresses.length > 0) {
    body.emailAddresses = emailAddresses.map((e) => ({
      type: e.type ?? "work",
      value: resolveLocator(e.value, itemJson),
    }));
  }

  const addresses = asRecord(node.parameters.addresses ?? {}).addressValues as
    | Array<{ type?: string; streetAddress?: string; city?: string; region?: string; postalCode?: string; country?: string }>
    | undefined;
  if (addresses && addresses.length > 0) {
    body.addresses = addresses.map((a) => ({
      type: a.type ?? "home",
      streetAddress: resolveLocator(a.streetAddress, itemJson),
      city: resolveLocator(a.city, itemJson),
      region: resolveLocator(a.region, itemJson),
      postalCode: resolveLocator(a.postalCode, itemJson),
      country: resolveLocator(a.country, itemJson),
    }));
  }

  const organizations = asRecord(node.parameters.organizations ?? {}).organizationValues as
    | Array<{ name?: string; title?: string; domain?: string }>
    | undefined;
  if (organizations && organizations.length > 0) {
    body.organizations = organizations.map((o) => ({
      name: resolveLocator(o.name, itemJson),
      title: resolveLocator(o.title, itemJson),
      domain: resolveLocator(o.domain, itemJson),
    }));
  }

  const additionalFields = asRecord(node.parameters.additionalFields ?? {});
  for (const [k, v] of Object.entries(additionalFields)) {
    if (v !== "" && v !== undefined && v !== null) {
      body[k] = resolveValue(v, itemJson);
    }
  }

  return body;
}

async function handleCreate(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body = buildContactBody(node, itemJson);
  const url = `${PEOPLE_API}/people:createContact`;
  const { body: result } = await apiRequest("POST", url, token, body);
  return asObj(result);
}

async function handleDelete(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const contactId = resolveLocator(node.parameters.contactId ?? "", itemJson);
  if (!contactId) throw new Error("GoogleContacts: Contact ID is required for delete");
  const url = `${PEOPLE_API}/${encodeURIComponent(contactId)}:deleteContact`;
  await apiRequest("DELETE", url, token);
  return { success: true };
}

async function handleGet(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const contactId = resolveLocator(node.parameters.contactId ?? "", itemJson);
  if (!contactId) throw new Error("GoogleContacts: Contact ID is required for get");
  const personFields = "names,emailAddresses,phoneNumbers,addresses,organizations,photos,memberships";
  const url = `${PEOPLE_API}/${encodeURIComponent(contactId)}${buildQuery({ personFields })}`;
  const { body: result } = await apiRequest("GET", url, token);
  return asObj(result);
}

async function handleGetAll(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const returnAll = resolveValue(node.parameters.returnAll ?? false, itemJson);
  const limit = Number(resolveValue(node.parameters.limit ?? 50, itemJson));
  const useQuery = resolveValue(node.parameters.useQuery ?? false, itemJson);
  const query = resolveLocator(node.parameters.query ?? "", itemJson);
  const sortOrder = resolveLocator(node.parameters.sortOrder ?? "LAST_MODIFIED_DESCENDING", itemJson);

  const personFields = "names,emailAddresses,phoneNumbers,addresses,organizations,photos,memberships";
  const qp: Record<string, string | undefined | null> = {
    personFields,
    sortOrder: sortOrder || "LAST_MODIFIED_DESCENDING",
    pageSize: returnAll ? undefined : String(limit),
  };

  if (useQuery && query) {
    qp.query = query;
  }

  const endpoint = useQuery && query ? "people:searchContacts" : "people/me/connections";
  const url = `${PEOPLE_API}/${endpoint}${buildQuery(qp)}`;
  const { body: result } = await apiRequest("GET", url, token);

  if (useQuery && query) {
    const results = asObj(result).results;
    if (Array.isArray(results)) {
      return results.map((r: unknown) => {
        const person = asObj(r).person;
        return person ? asObj(person) : asObj(r);
      });
    }
    return [];
  }

  const connections = asObj(result).connections;
  if (Array.isArray(connections)) return connections as Record<string, unknown>[];
  return [];
}

async function handleUpdate(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const contactId = resolveLocator(node.parameters.contactId ?? "", itemJson);
  if (!contactId) throw new Error("GoogleContacts: Contact ID is required for update");

  const updatePerson = asRecord(node.parameters.updatePerson ?? {});
  const updatePersonFields = asRecord(updatePerson.updatePersonFields ?? {});
  const personFields = resolveLocator(updatePersonFields.personFields, itemJson) || "names,emailAddresses,phoneNumbers,addresses,organizations";

  const body = buildContactBody(node, itemJson);
  const url = `${PEOPLE_API}/${encodeURIComponent(contactId)}:updateContact${buildQuery({ personFields, updatePersonFields: personFields })}`;
  const { body: result } = await apiRequest("PATCH", url, token, body);
  return asObj(result);
}
import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://{domain}.myfreshworks.com/crm/sales";

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

interface OpResult {
  json: Record<string, unknown>;
}

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
}

export const freshworksCrmExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "contact");
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

async function getApiBase(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("freshworksCrmApi");
  if (cred) {
    const data = cred as Record<string, unknown>;
    const domain = String(data.domain ?? "");
    if (domain) return API_BASE.replace("{domain}", domain);
  }
  throw new Error("Freshworks CRM: No valid credential found. Configure freshworksCrmApi with a domain.");
}

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("freshworksCrmApi");
  if (cred) {
    const data = cred as Record<string, unknown>;
    const apiKey = String(data.apiKey ?? "");
    if (apiKey) return { Authorization: `Token token=${apiKey}` };
  }
  throw new Error("Freshworks CRM: No valid credential found. Configure freshworksCrmApi with an apiKey.");
}

function getResourcePlural(resource: string): string {
  const pluralMap: Record<string, string> = {
    account: "accounts",
    appointment: "appointments",
    contact: "contacts",
    deal: "deals",
    note: "notes",
    salesActivity: "sales_activities",
    task: "tasks",
  };
  return pluralMap[resource] ?? resource + "s";
}

function processError(body: unknown, status: number): Error {
  const msg =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).message ?? (body as Record<string, unknown>).error ?? JSON.stringify(body)
      : String(body ?? "");
  const err = new Error(`Freshworks CRM: ${status} ${msg}`);
  (err as Record<string, unknown>).status = status;
  return err;
}

async function fetchJson(
  baseUrl: string,
  headers: Record<string, string>,
  urlPath: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const url = `${baseUrl}${urlPath}`;
  const init: RequestInit = {
    method,
    headers: { ...headers, "content-type": "application/json" },
  };
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (res.status < 200 || res.status >= 300) {
    throw processError(parsed, res.status);
  }
  return { status: res.status, body: parsed };
}

function extractOutput(
  resource: string,
  operation: string,
  body: unknown,
): OpResult[] {
  const obj = body as Record<string, unknown> | undefined;
  if (!obj) return [{ json: {} }];

  if (operation === "delete") {
    return [{ json: {} }];
  }

  if (operation === "getAll" || operation === "search") {
    const plural = getResourcePlural(resource);
    const key = operation === "search" ? "results" : plural;
    const arr = (obj[key] ?? obj[plural]) as Record<string, unknown>[] | undefined;
    if (Array.isArray(arr)) {
      return arr.map((item) => ({ json: item }));
    }
    return [{ json: obj }];
  }

  if (operation === "create" || operation === "update" || operation === "get") {
    if (obj[resource]) {
      return [{ json: { [resource]: obj[resource] } }];
    }
    return [{ json: obj }];
  }

  return [{ json: obj }];
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult[]> {
  const baseUrl = await getApiBase(ctx);
  const headers = await getAuthHeaders(ctx);
  const params = node.parameters as Record<string, unknown>;

  if (resource === "search" && operation === "search") {
    const searchTerm = String(resolveValue(params.searchTerm ?? "", itemJson));
    const entities = params.entities as string[] | undefined;
    let urlPath = `/api/search?q=${encodeURIComponent(searchTerm)}`;
    if (entities && entities.length > 0) {
      urlPath += `&include=${entities.join(",")}`;
    }
    const { body } = await fetchJson(baseUrl, headers, urlPath, "GET");
    return extractOutput(resource, operation, body);
  }

  const idField = `${resource}Id`;
  const fieldsParam = `${resource}Fields`;
  const plural = getResourcePlural(resource);

  switch (operation) {
    case "create": {
      const rawFields = params[fieldsParam] as Record<string, unknown> | undefined;
      const resolvedFields = rawFields ? resolveObject(rawFields, itemJson) : {};
      const requestBody = { [resource]: resolvedFields };
      const { body } = await fetchJson(baseUrl, headers, `/api/${plural}`, "POST", requestBody);
      return extractOutput(resource, operation, body);
    }

    case "get": {
      const id = Number(resolveValue(params[idField] ?? 0, itemJson));
      const { body } = await fetchJson(baseUrl, headers, `/api/${plural}/${id}`, "GET");
      return extractOutput(resource, operation, body);
    }

    case "update": {
      const id = Number(resolveValue(params[idField] ?? 0, itemJson));
      const rawFields = params[fieldsParam] as Record<string, unknown> | undefined;
      const resolvedFields = rawFields ? resolveObject(rawFields, itemJson) : {};
      const requestBody = { [resource]: resolvedFields };
      const { body } = await fetchJson(baseUrl, headers, `/api/${plural}/${id}`, "PUT", requestBody);
      return extractOutput(resource, operation, body);
    }

    case "delete": {
      const id = Number(resolveValue(params[idField] ?? 0, itemJson));
      await fetchJson(baseUrl, headers, `/api/${plural}/${id}`, "DELETE");
      return [{ json: {} }];
    }

    case "getAll": {
      const limit = Number(resolveValue(params.limit ?? 25, itemJson));
      const view = Number(resolveValue(params.view ?? 0, itemJson));
      let urlPath = `/api/${plural}?per_page=${limit}`;
      if (view > 0) urlPath += `&filter=${view}`;
      const { body } = await fetchJson(baseUrl, headers, urlPath, "GET");
      return extractOutput(resource, operation, body);
    }

    default:
      throw new Error(`Freshworks CRM: Unknown operation "${operation}" for resource "${resource}"`);
  }
}

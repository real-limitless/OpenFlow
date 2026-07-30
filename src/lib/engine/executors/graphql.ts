import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

interface HeaderParam {
  name: string;
  value: string;
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function safeParseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  if (raw === "") return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export const graphqlExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];

  const authentication = (node.parameters.authentication as string) ?? "none";
  const requestMethod = ((node.parameters.requestMethod as string) ?? "POST").toUpperCase();
  const responseFormat = (node.parameters.responseFormat as string) ?? "json";
  const dataPropertyName = (node.parameters.dataPropertyName as string) ?? "data";

  for (const item of items) {
    const itemJson = item.json ?? {};

    const endpoint = String(resolveValue(node.parameters.endpoint, itemJson) ?? "");
    if (!endpoint) {
      throw new Error("GraphQL: endpoint is required");
    }

    const query = String(resolveValue(node.parameters.query, itemJson) ?? "");
    if (!query) {
      throw new Error("GraphQL: query is required");
    }

    const headers: Record<string, string> = {};

    const headerContainer = node.parameters.headerParametersUi as
      { parameter?: HeaderParam[] } | HeaderParam[] | undefined;
    const headerParams: HeaderParam[] = Array.isArray(headerContainer)
      ? headerContainer
      : (headerContainer?.parameter ?? []);
    for (const h of headerParams) {
      if (h.name) {
        headers[h.name] = String(resolveValue(h.value, itemJson));
      }
    }

    let url = endpoint;
    let body: string | undefined;
    const method = requestMethod;

    if (method === "POST") {
      const requestFormat = (node.parameters.requestFormat as string) ?? "json";
      if (requestFormat === "graphql") {
        body = query;
        headers["Content-Type"] = headers["Content-Type"] ?? "application/graphql";
      } else {
        const jsonBody: Record<string, unknown> = { query };
        const variablesRaw = resolveValue(node.parameters.variables, itemJson);
        const variables = safeParseJson(variablesRaw);
        if (
          variables &&
          typeof variables === "object" &&
          !Array.isArray(variables) &&
          Object.keys(variables).length > 0
        ) {
          jsonBody.variables = variables;
        }
        const operationName = String(resolveValue(node.parameters.operationName, itemJson) ?? "");
        if (operationName) {
          jsonBody.operationName = operationName;
        }
        body = JSON.stringify(jsonBody);
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      }
    } else {
      const u = new URL(url);
      u.searchParams.set("query", query);
      url = u.toString();
    }

    await applyCredentials(ctx, authentication, headers, url).then((resolved) => {
      if (resolved.url) url = resolved.url;
    });

    const response = await performRequest(method, url, headers, body);

    if (!response.ok) {
      throw new Error(`GraphQL: HTTP ${response.status} ${response.statusText}`.trim());
    }

    const text = await response.text();

    if (responseFormat === "string") {
      out.push({ json: { [dataPropertyName]: text }, pairedItem: item.pairedItem });
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { data: text };
      }
      const outJson: Record<string, unknown> =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : { data: parsed };
      out.push({ json: outJson, pairedItem: item.pairedItem });
    }
  }

  return [out];
};

async function applyCredentials(
  ctx: { getCredential: (name: string) => Promise<Record<string, unknown> | null> },
  authentication: string,
  headers: Record<string, string>,
  url: string,
): Promise<{ url?: string }> {
  if (authentication === "none") return {};

  if (authentication === "basicAuth") {
    const cred = await ctx.getCredential("httpBasicAuth");
    if (cred) {
      const user = String(cred.user ?? "");
      const password = String(cred.password ?? "");
      headers["Authorization"] = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
    }
    return {};
  }

  if (authentication === "headerAuth") {
    const cred = await ctx.getCredential("httpHeaderAuth");
    if (cred) {
      const headerName = String(cred.name ?? "X-API-Key");
      const headerValue = String(cred.value ?? "");
      headers[headerName] = headerValue;
    }
    return {};
  }

  if (authentication === "queryAuth") {
    const cred = await ctx.getCredential("httpQueryAuth");
    if (cred) {
      const paramName = String(cred.name ?? "api_key");
      const paramValue = String(cred.value ?? "");
      const separator = url.includes("?") ? "&" : "?";
      return {
        url: `${url}${separator}${encodeURIComponent(paramName)}=${encodeURIComponent(paramValue)}`,
      };
    }
  }

  return {};
}

async function performRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text: async () => text,
    };
  } catch (err) {
    throw new Error(`GraphQL request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

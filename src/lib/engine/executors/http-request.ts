import type { NodeExecutor } from "../types";
import { evaluateExpression } from "../../expressions/evaluate";

interface HeaderParam {
  name: string;
  value: string;
}

interface QueryParam {
  name: string;
  value: string;
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("{{") || raw.startsWith("=")) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

export const httpRequestExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const itemJson = inputItems[0]?.json ?? {};

  const method = (node.parameters.method as string) ?? "GET";
  const rawUrl = (node.parameters.url as string) ?? "";
  let url = String(resolveValue(rawUrl, itemJson));

  const headers: Record<string, string> = {};
  if (node.parameters.sendHeaders) {
    const headerContainer = node.parameters.headerParameters as
      { parameters?: HeaderParam[] } | HeaderParam[] | undefined;
    const headerParams: HeaderParam[] = Array.isArray(headerContainer)
      ? headerContainer
      : (headerContainer?.parameters ?? []);
    for (const h of headerParams) {
      if (h.name) {
        headers[h.name] = String(resolveValue(h.value, itemJson));
      }
    }
  }

  let bodyInit: string | undefined;
  const isBodyAllowed = method !== "GET" && method !== "HEAD";
  if (node.parameters.sendBody && isBodyAllowed) {
    const contentType = (node.parameters.contentType as string) ?? "json";

    if (contentType === "json") {
      const raw = node.parameters.jsonBody;
      const parsed = typeof raw === "string" ? safeParse(raw) : raw;
      bodyInit = JSON.stringify(parsed);
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    } else if (contentType === "form-urlencoded") {
      const formContainer = node.parameters.bodyParameters as
        { parameters?: Array<{ name: string; value: string }> } | undefined;
      const params = formContainer?.parameters ?? [];
      const pairs = params.map(
        (p) =>
          `${encodeURIComponent(p.name)}=${encodeURIComponent(resolveValue(p.value, itemJson) as string)}`,
      );
      bodyInit = pairs.join("&");
      headers["Content-Type"] = headers["Content-Type"] ?? "application/x-www-form-urlencoded";
    } else {
      const raw = node.parameters.jsonBody;
      bodyInit = typeof raw === "string" ? raw : JSON.stringify(raw);
    }
  }

  const credentials = node.credentials ?? {};

  if (credentials.httpBasicAuth && ctx.getCredential) {
    const cred = await ctx.getCredential("httpBasicAuth");
    if (cred) {
      const user = String(cred.user ?? "");
      const password = String(cred.password ?? "");
      headers["Authorization"] = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
    }
  }

  if (credentials.httpHeaderAuth && ctx.getCredential) {
    const cred = await ctx.getCredential("httpHeaderAuth");
    if (cred) {
      const headerName = String(cred.name ?? "X-API-Key");
      const headerValue = String(cred.value ?? "");
      headers[headerName] = headerValue;
    }
  }

  if (credentials.httpQueryAuth && ctx.getCredential) {
    const cred = await ctx.getCredential("httpQueryAuth");
    if (cred) {
      const paramName = String(cred.name ?? "api_key");
      const paramValue = String(cred.value ?? "");
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}${encodeURIComponent(paramName)}=${encodeURIComponent(paramValue)}`;
    }
  }

  if (node.parameters.sendQuery) {
    const queryContainer = node.parameters.queryParameters as
      { parameters?: QueryParam[] } | QueryParam[] | undefined;
    const queryParams: QueryParam[] = Array.isArray(queryContainer)
      ? queryContainer
      : (queryContainer?.parameters ?? []);
    if (queryParams.length > 0) {
      const u = new URL(url);
      for (const q of queryParams) {
        if (q.name) {
          u.searchParams.set(q.name, String(resolveValue(q.value, itemJson)));
        }
      }
      return executeWithUrl(u.toString(), method, headers, bodyInit, node);
    }
  }

  return executeWithUrl(url, method, headers, bodyInit, node);
};

async function executeWithUrl(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  node: { parameters: Record<string, unknown> },
): Promise<import("../../workflow/types").INodeExecutionData[][]> {
  const options = (node.parameters.options as Record<string, unknown> | undefined) ?? {};
  const responseOptions = (options.response as Record<string, unknown> | undefined) ?? {};
  const timeout = (options.timeout as number) ?? 10000;
  const followRedirect = options.followRedirect !== false;

  const fullResponse = responseOptions.fullResponse === true || options.fullResponse === true;
  const neverError = responseOptions.neverError === true || options.neverError === true;
  const responseFormat = (responseOptions.responseFormat as string) ?? "autodetect";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect: followRedirect ? "follow" : "manual",
    });
    clearTimeout(timer);

    if (!response.ok && !neverError) {
      throw new Error(`HTTP ${response.status} ${response.statusText ?? ""}`.trim());
    }

    let responseData: unknown;
    if (responseFormat === "json") {
      responseData = await response.json();
    } else if (responseFormat === "text") {
      responseData = await response.text();
    } else if (responseFormat === "file") {
      // TODO: binary file handling not implemented; return text for now
      responseData = await response.text();
    } else {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
    }

    if (fullResponse) {
      return [
        [
          {
            json: {
              statusCode: response.status,
              headers: Object.fromEntries(response.headers.entries()),
              body: responseData,
            },
          },
        ],
      ];
    }

    return [
      [
        {
          json:
            typeof responseData === "object" && responseData !== null
              ? (responseData as Record<string, unknown>)
              : { data: responseData },
        },
      ],
    ];
  } catch (err) {
    throw new Error(`HTTP Request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

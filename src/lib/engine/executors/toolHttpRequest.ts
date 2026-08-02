import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface HeaderParam {
  name: string;
  value: string;
}

interface QueryParam {
  name: string;
  value: string;
}

interface ToolHandle {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  invoke(args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }>;
}

function resolveValue(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  return String(raw);
}

export const toolHttpRequestExecutor: NodeExecutor = async (ctx) => {
  const method = String(ctx.getParam("method", "GET"));
  const url = String(ctx.getParam("url", ""));
  const sendQuery = Boolean(ctx.getParam("sendQuery", false));
  const sendHeaders = Boolean(ctx.getParam("sendHeaders", false));
  const sendBody = Boolean(ctx.getParam("sendBody", false));
  const bodyContentType = String(ctx.getParam("bodyContentType", "json"));
  const description = String(ctx.getParam("description", "Makes an HTTP request to the specified URL and returns the response body."));

  const handle: ToolHandle = {
    name: ctx.node.name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to request" },
        method: { type: "string", description: "HTTP method" },
        queryParameters: { type: "object", description: "URL query parameters" },
        headers: { type: "object", description: "Request headers" },
        body: { type: "string", description: "Request body" },
      },
    },
    async invoke(args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> {
      const resolvedUrl = (args.url as string) || url;
      const resolvedMethod = (args.method as string) || method;
      const resolvedBody = (args.body as string) || undefined;

      const resolvedHeaders: Record<string, string> = {};
      if (sendHeaders) {
        const headerContainer = ctx.getParam("headerParameters") as
          { parameters?: HeaderParam[] } | undefined;
        for (const h of headerContainer?.parameters ?? []) {
          if (h.name) resolvedHeaders[h.name] = resolveValue(h.value);
        }
      }
      if (args.headers && typeof args.headers === "object") {
        Object.assign(resolvedHeaders, args.headers);
      }

      let targetUrl = resolvedUrl;
      if (sendQuery) {
        const queryContainer = ctx.getParam("queryParameters") as
          { parameters?: QueryParam[] } | undefined;
        const queryParams = queryContainer?.parameters ?? [];
        if (queryParams.length > 0 || args.queryParameters) {
          const u = new URL(targetUrl);
          for (const q of queryParams) {
            if (q.name) u.searchParams.set(q.name, resolveValue(q.value));
          }
          if (args.queryParameters && typeof args.queryParameters === "object") {
            for (const [k, v] of Object.entries(args.queryParameters as Record<string, string>)) {
              u.searchParams.set(k, v);
            }
          }
          targetUrl = u.toString();
        }
      }

      let bodyInit: string | undefined;
      const isBodyAllowed = resolvedMethod !== "GET" && resolvedMethod !== "HEAD";
      if (sendBody && isBodyAllowed) {
        if (bodyContentType === "json") {
          bodyInit = resolvedBody ?? JSON.stringify(ctx.getParam("jsonBody", {}));
          resolvedHeaders["Content-Type"] = resolvedHeaders["Content-Type"] ?? "application/json";
        } else {
          bodyInit = resolvedBody;
        }
      } else if (resolvedBody && isBodyAllowed) {
        bodyInit = resolvedBody;
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(targetUrl, {
          method: resolvedMethod,
          headers: resolvedHeaders,
          body: bodyInit,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          const message = `HTTP ${response.status} ${response.statusText ?? ""}`.trim();
          if (ctx.continueOnFail()) {
            return { content: `${message}\n${errBody}`, isError: true };
          }
          throw new Error(`HTTP Request failed: ${message}`);
        }

        const contentType = response.headers.get("content-type") ?? "";
        let responseData: string;
        if (contentType.includes("application/json")) {
          const json = await response.json();
          responseData = JSON.stringify(json);
        } else {
          responseData = await response.text();
        }

        return { content: responseData };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (ctx.continueOnFail()) {
          return { content: message, isError: true };
        }
        throw new Error(`HTTP Request failed: ${message}`);
      }
    },
  };

  const output: INodeExecutionData = {
    json: handle as unknown as Record<string, unknown>,
  };

  return [[output]];
};

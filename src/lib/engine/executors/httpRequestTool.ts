import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";

interface HeaderParam {
  name: string;
  value: string;
}

interface QueryParam {
  name: string;
  value: string;
}

interface BodyParam {
  name: string;
  value: string;
}

interface FormDataParam {
  parameterType: string;
  name: string;
  value: string;
  inputDataFieldName?: string;
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("{{") || raw.startsWith("=")) {
    return raw;
  }
  return raw;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function getNested(obj: Record<string, unknown> | undefined, ...paths: string[]): unknown {
  if (!obj) return undefined;
  for (const path of paths) {
    const val = path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
    if (val !== undefined) return val;
  }
  return undefined;
}

export const httpRequestToolExecutor: NodeExecutor = async (ctx, node) => {
  if (ctx.getInputItems(0).length === 0) {
    const handle = {
      type: "n8n-nodes-base.httpRequestTool",
      name: String(ctx.getParam("toolName", "http_request")),
      description: String(
        ctx.getParam("description", "Make an HTTP request and return the response body"),
      ),
      schema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Request URL" },
          method: { type: "string", description: "HTTP method" },
          body: { description: "Optional JSON body" },
        },
      },
      async invoke(args: Record<string, unknown>) {
        const merged = { ...node.parameters, ...args };
        const url = String(merged.url ?? "");
        if (ctx.allowUrl && !ctx.allowUrl(url)) {
          throw new Error(`HTTP Request blocked by allowUrl policy: ${url}`);
        }
        const method = String(merged.method ?? "GET");
        const headers: Record<string, string> = {};
        let bodyInit: string | undefined;
        if (merged.body !== undefined && method !== "GET" && method !== "HEAD") {
          bodyInit = typeof merged.body === "string" ? merged.body : JSON.stringify(merged.body);
          headers["Content-Type"] = "application/json";
        } else if (merged.sendBody && merged.jsonBody !== undefined) {
          bodyInit =
            typeof merged.jsonBody === "string" ? merged.jsonBody : JSON.stringify(merged.jsonBody);
          headers["Content-Type"] = "application/json";
        }
        const res = await fetch(url, { method, headers, body: bodyInit });
        const text = await res.text();
        if (ctx.allowUrl && !res.ok) {
          /* still return body */
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
        }
        try {
          return { content: text };
        } catch {
          return { content: text };
        }
      },
    };
    const pairedItem = { item: 0, input: 0 };
    return [[{ json: handle as unknown as Record<string, unknown>, pairedItem }]];
  }

  const inputItems = ctx.getInputItems(0);
  const options = (node.parameters.options as Record<string, unknown>) ?? {};
  const responseOptions = (options.response as Record<string, unknown>) ?? {};

  const includeResponseHeadersAndStatus =
    (responseOptions.includeResponseHeadersAndStatus as boolean) ??
    (options.includeResponseHeadersAndStatus as boolean) ??
    false;
  const neverError =
    (responseOptions.neverError as boolean) ?? (options.neverError as boolean) ?? false;

  const optimizeResponse =
    (responseOptions.optimizeResponse as boolean) ?? (options.optimizeResponse as boolean) ?? false;

  const results: Array<{ json: unknown }> = [];

  for (let idx = 0; idx < inputItems.length; idx++) {
    const item = inputItems[idx];
    const itemJson = (item.json ?? {}) as Record<string, unknown>;

    const method = (node.parameters.method as string) ?? "GET";
    let url = String(resolveValue((node.parameters.url as string) ?? "", itemJson));

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
      const bodyContentType = (node.parameters.bodyContentType as string) ?? "json";

      if (bodyContentType === "json") {
        const raw = node.parameters.jsonBody;
        const parsed = typeof raw === "string" ? safeParse(raw) : raw;
        bodyInit = JSON.stringify(parsed);
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      } else if (bodyContentType === "formUrlencoded") {
        const formContainer = node.parameters.bodyParameters as
          { parameters?: BodyParam[] } | undefined;
        const params = formContainer?.parameters ?? [];
        const pairs = params.map(
          (p) =>
            `${encodeURIComponent(p.name)}=${encodeURIComponent(resolveValue(p.value, itemJson) as string)}`,
        );
        bodyInit = pairs.join("&");
        headers["Content-Type"] = headers["Content-Type"] ?? "application/x-www-form-urlencoded";
      } else if (bodyContentType === "raw") {
        bodyInit = (node.parameters.rawBody as string) ?? "";
        const rawCt = node.parameters.rawContentType as string | undefined;
        if (rawCt) {
          headers["Content-Type"] = headers["Content-Type"] ?? rawCt;
        }
      } else if (bodyContentType === "formData") {
        const fdContainer = node.parameters.formDataParameters as
          { parameters?: FormDataParam[] } | undefined;
        const params = fdContainer?.parameters ?? [];
        const parts: string[] = [];
        for (const p of params) {
          const val = resolveValue(p.value, itemJson);
          parts.push(
            `--X-BOUNDARY\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${val}`,
          );
        }
        parts.push("--X-BOUNDARY--");
        bodyInit = parts.join("\r\n");
        headers["Content-Type"] =
          headers["Content-Type"] ?? "multipart/form-data; boundary=X-BOUNDARY";
      } else if (bodyContentType === "binaryData") {
        const fieldName = (node.parameters.binaryInputDataFieldName as string) ?? "data";
        const binaryData = item.binary?.[fieldName];
        if (binaryData) {
          bodyInit = binaryData.data;
          headers["Content-Type"] =
            headers["Content-Type"] ?? binaryData.mimeType ?? "application/octet-stream";
        }
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
        url = u.toString();
      }
    }

    const timeout =
      getNested(options, "timeout") != null ? Number(getNested(options, "timeout")) : 10000;
    const followRedirect = getNested(
      responseOptions,
      "redirect.followRedirects",
      "followRedirect",
    ) as boolean | undefined;
    const follow =
      followRedirect !== undefined
        ? followRedirect
        : (getNested(options, "redirect.followRedirects", "followRedirect") ?? true);

    try {
      if (ctx.allowUrl && !ctx.allowUrl(url)) {
        throw new Error(`HTTP Request blocked by allowUrl policy: ${url}`);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers,
        body: bodyInit,
        signal: controller.signal,
        redirect: follow ? "follow" : "manual",
      });
      clearTimeout(timer);

      if (!response.ok && !neverError) {
        throw new Error(`HTTP ${response.status} ${response.statusText ?? ""}`.trim());
      }

      const responseFormat =
        (responseOptions.responseFormat as string) ??
        (options.responseFormat as string) ??
        "autoDetect";

      let responseData: unknown;
      if (responseFormat === "json") {
        responseData = await response.json();
      } else if (responseFormat === "file" || responseFormat === "text") {
        responseData = await response.text();
      } else {
        const ct = response.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }
      }

      if (includeResponseHeadersAndStatus) {
        responseData = {
          body: responseData,
          headers: Object.fromEntries(response.headers.entries()),
          statusCode: response.status,
        };
      }

      if (optimizeResponse) {
        responseData = await optimizeResponseData(responseData, responseOptions, options);
      }

      results.push({
        json:
          typeof responseData === "object" && responseData !== null
            ? (responseData as Record<string, unknown>)
            : responseData,
      });
    } catch (err) {
      throw new Error(`HTTP Request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return [
    results.map((item, idx) => withPairedItem({ json: item.json as Record<string, unknown> }, idx)),
  ];
};

async function optimizeResponseData(
  data: unknown,
  responseOptions: Record<string, unknown>,
  options: Record<string, unknown>,
): Promise<unknown> {
  const expectedResponseType =
    (responseOptions.expectedResponseType as string) ??
    (options.expectedResponseType as string) ??
    "json";

  if (expectedResponseType === "json") {
    const fieldContainingData =
      (responseOptions.fieldContainingData as string) ?? (options.fieldContainingData as string);
    const includeFields =
      (responseOptions.includeFields as string) ?? (options.includeFields as string) ?? "all";
    const fields = (responseOptions.fields as string) ?? (options.fields as string);

    if (fieldContainingData && typeof data === "object" && data !== null) {
      const parts = fieldContainingData.split(".");
      let current: unknown = data;
      for (const part of parts) {
        if (
          current &&
          typeof current === "object" &&
          part in (current as Record<string, unknown>)
        ) {
          current = (current as Record<string, unknown>)[part];
        } else {
          current = undefined;
          break;
        }
      }
      if (current !== undefined) {
        if (typeof current === "string") {
          return current;
        }
        return current;
      }
    }

    if (includeFields !== "all" && fields && typeof data === "object" && data !== null) {
      const fieldNames = fields.split(",").map((f) => f.trim());
      const filtered: Record<string, unknown> = {};
      const obj = data as Record<string, unknown>;
      if (includeFields === "selected") {
        for (const f of fieldNames) {
          const val = f.split(".").reduce<unknown>((acc, key) => {
            if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
              return (acc as Record<string, unknown>)[key];
            }
            return undefined;
          }, obj);
          if (val !== undefined) {
            setNested(filtered, f, val);
          }
        }
        return filtered;
      } else if (includeFields === "exclude") {
        const excludeSet = new Set(fieldNames);
        for (const [k, v] of Object.entries(obj)) {
          if (!excludeSet.has(k)) {
            filtered[k] = v;
          }
        }
        return filtered;
      }
    }

    return data;
  }

  if (expectedResponseType === "html" || expectedResponseType === "text") {
    let text = typeof data === "string" ? data : JSON.stringify(data);

    const returnOnlyContent =
      (responseOptions.returnOnlyContent as boolean) ??
      (options.returnOnlyContent as boolean) ??
      false;

    if (returnOnlyContent) {
      text = stripHtml(text);

      const elementsToOmit =
        (responseOptions.elementsToOmit as string) ?? (options.elementsToOmit as string);
      if (elementsToOmit) {
        const selectors = elementsToOmit.split(",").map((s) => s.trim());
        for (const sel of selectors) {
          text = removeBySelector(text, sel);
        }
      }
    }

    const truncateResponse =
      (responseOptions.truncateResponse as boolean) ??
      (options.truncateResponse as boolean) ??
      false;
    if (truncateResponse) {
      const maxChars =
        (responseOptions.maxResponseCharacters as number) ??
        (options.maxResponseCharacters as number) ??
        1000;
      if (text.length > maxChars) {
        text = text.slice(0, maxChars);
      }
    }

    return text;
  }

  return data;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeBySelector(html: string, _selector: string): string {
  return html;
}

function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current)) {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

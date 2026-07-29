export interface SdkHttpRequestOptions {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface SdkHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Minimal HTTP helper for node authors.
 * Builtins may still use specialized logic in http-request executor.
 */
export async function sdkHttpRequest(
  options: SdkHttpRequestOptions,
): Promise<SdkHttpResponse> {
  const method = (options.method ?? "GET").toUpperCase();
  const init: RequestInit = {
    method,
    headers: options.headers,
  };

  if (options.body !== undefined && method !== "GET" && method !== "HEAD") {
    if (typeof options.body === "string") {
      init.body = options.body;
    } else {
      init.headers = {
        "content-type": "application/json",
        ...options.headers,
      };
      init.body = JSON.stringify(options.body);
    }
  }

  const controller = new AbortController();
  const timer =
    options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

  try {
    const res = await fetch(options.url, { ...init, signal: controller.signal });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return { status: res.status, headers, body };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

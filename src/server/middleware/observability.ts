import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";
import type { AppEnv } from "./auth";
import { recordHttpRequest } from "../../lib/observability/metrics";
import { requestContext } from "../../lib/observability/request-context";
import { exportSpan, parseTraceparent } from "../../lib/observability/trace";

export async function observabilityMiddleware(c: Context<AppEnv>, next: Next) {
  const startMs = Date.now();
  const trace = parseTraceparent(c.req.header("traceparent"));
  const requestId = c.req.header("x-request-id")?.trim() || randomUUID();
  c.header("X-Request-Id", requestId);
  c.header("X-Trace-Id", trace.traceId);
  c.header("traceparent", trace.traceparent);

  await requestContext.run({ requestId, traceId: trace.traceId, spanId: trace.spanId }, async () => {
    await next();
  });

  const status = c.res.status;
  const path = new URL(c.req.url).pathname;
  recordHttpRequest(c.req.method, path, status, Date.now() - startMs);
  void exportSpan({
    trace,
    name: `${c.req.method.toUpperCase()} ${path}`,
    startMs,
    endMs: Date.now(),
    statusCode: status,
    attributes: {
      "http.method": c.req.method.toUpperCase(),
      "http.route": path,
      "http.status_code": status,
      "http.request_id": requestId,
    },
  });
}

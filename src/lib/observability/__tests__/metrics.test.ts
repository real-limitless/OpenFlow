import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  incCounter,
  metricsTokenFromEnv,
  observeHistogram,
  recordExecution,
  recordHttpRequest,
  renderPrometheus,
  resetMetricsForTests,
  snapshot,
} from "../metrics";
import { parseTraceparent } from "../trace";
import metricsRoute from "../../../server/routes/metrics";
import { observabilityMiddleware } from "../../../server/middleware/observability";
import type { AppEnv } from "../../../server/middleware/auth";
import { isApiPath } from "../../../server/api-prefixes";

describe("Prometheus text", () => {
  it("exposes counters, histograms, and build info", () => {
    resetMetricsForTests();
    recordHttpRequest("GET", "/api/v1/workflows/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", 200, 12);
    recordExecution("started");
    incCounter("openflow_worker_jobs_total", { status: "completed" });
    observeHistogram("openflow_execution_duration_seconds", 0.2);
    const text = renderPrometheus();
    expect(text).toContain("openflow_http_requests_total");
    expect(text).toContain('route="/api/v1/workflows/:id"');
    expect(text).toContain("openflow_http_request_duration_seconds_bucket");
    expect(text).toContain("openflow_executions_total");
    expect(text).toContain("openflow_build_info{version=\"0.1.0\"} 1");
    expect(text).toContain("openflow_up");
    expect(snapshot().counters).toBeGreaterThan(0);
  });

  it("reads scrape token from either env name", () => {
    expect(metricsTokenFromEnv({ OPENFLOW_METRICS_TOKEN: "abc" })).toBe("abc");
    expect(metricsTokenFromEnv({ METRICS_TOKEN: "xyz" })).toBe("xyz");
    expect(metricsTokenFromEnv({})).toBe("");
  });
});

describe("traceparent", () => {
  it("continues a valid W3C header and mints a new span", () => {
    const parent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const ctx = parseTraceparent(parent);
    expect(ctx.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(ctx.parentSpanId).toBe("00f067aa0ba902b7");
    expect(ctx.spanId).not.toBe("00f067aa0ba902b7");
    expect(ctx.traceparent.startsWith("00-4bf92f3577b34da6a3ce929d0e0e4736-")).toBe(true);
  });

  it("mints a new trace when the header is missing", () => {
    const ctx = parseTraceparent(undefined);
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(ctx.parentSpanId).toBeNull();
  });
});

describe("GET /metrics", () => {
  it("is an API path and returns Prometheus text with request ids", async () => {
    expect(isApiPath("/metrics")).toBe(true);
    resetMetricsForTests();
    const app = new Hono<AppEnv>();
    app.use("*", observabilityMiddleware);
    metricsRoute(app);
    app.get("/health", (c) => c.json({ status: "ok" }));
    await app.request("/health");
    const res = await app.request("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("x-trace-id")).toMatch(/^[0-9a-f]{32}$/);
    const body = await res.text();
    expect(body).toContain("openflow_http_requests_total");
  });

  it("returns 401 when a scrape token is configured and missing", async () => {
    const prev = process.env.OPENFLOW_METRICS_TOKEN;
    process.env.OPENFLOW_METRICS_TOKEN = "secret-token";
    try {
      const app = new Hono<AppEnv>();
      metricsRoute(app);
      const denied = await app.request("/metrics");
      expect(denied.status).toBe(401);
      const ok = await app.request("/metrics", {
        headers: { authorization: "Bearer secret-token" },
      });
      expect(ok.status).toBe(200);
    } finally {
      if (prev === undefined) delete process.env.OPENFLOW_METRICS_TOKEN;
      else process.env.OPENFLOW_METRICS_TOKEN = prev;
    }
  });
});

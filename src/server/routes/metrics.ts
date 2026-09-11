import { timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { config } from "../../config";
import {
  metricsTokenFromEnv,
  renderPrometheus,
  setGauge,
  snapshot,
} from "../../lib/observability/metrics";

function presentedMetricsToken(c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } }): string | undefined {
  const auth = c.req.header("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const query = c.req.query("token")?.trim();
  return query || undefined;
}

function tokenMatches(presented: string | undefined, expected: string): boolean {
  if (!expected) return true;
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function refreshQueueGauges() {
  try {
    const { executionQueue } = await import("../queue");
    const counts = await executionQueue.getJobCounts();
    for (const [state, n] of Object.entries(counts)) {
      setGauge("openflow_queue_jobs", Number(n) || 0, { state });
    }
  } catch {
    /* Redis optional for unit tests */
  }
}

export default function metricsRoute(app: Hono<AppEnv>) {
  app.get("/metrics", async (c) => {
    const expected = metricsTokenFromEnv();
    if (!tokenMatches(presentedMetricsToken(c), expected)) {
      return c.text("unauthorized\n", 401);
    }
    await refreshQueueGauges();
    return c.text(renderPrometheus(), 200, {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
    });
  });

  app.get("/api/v1/observability", async (c) => {
    await refreshQueueGauges();
    const token = metricsTokenFromEnv();
    return c.json({
      scrapePath: "/metrics",
      scrapeAuth: token ? "bearer" : "none",
      otelExporter: config.observability.otelExporterOtlpEndpoint ? "configured" : "unset",
      otelEndpoint: config.observability.otelExporterOtlpEndpoint
        ? config.observability.otelExporterOtlpEndpoint.replace(/\/$/, "") + "/v1/traces"
        : null,
      errorTracker: process.env.SENTRY_DSN?.trim() ? "sentry" : "none",
      headers: {
        requestId: "X-Request-Id",
        traceId: "X-Trace-Id",
        traceparent: "traceparent",
      },
      snapshot: snapshot(),
    });
  });
}

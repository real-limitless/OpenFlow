import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import type { AppEnv } from "../middleware/auth";
import { setRedisEvalForTests } from "../../lib/security/rate-limit";
import { addLogSink, clearLogSinks, configureLogger, type LogRecord } from "../log";

describe("rate limit hit logging", () => {
  afterEach(() => {
    setRedisEvalForTests(null);
    delete process.env.REDIS_URL;
    clearLogSinks();
  });

  it("emits event=rate_limit when the limiter denies the request", async () => {
    configureLogger({ level: "debug", format: "json" });
    const captured: LogRecord[] = [];
    addLogSink((record) => {
      captured.push(record);
    });
    setRedisEvalForTests(async () => [121, 2000]);

    const app = new Hono<AppEnv>();
    app.use("*", rateLimitMiddleware);
    app.get("/api/v1/workflows", (c) => c.json({ ok: true }));

    const res = await app.request("/api/v1/workflows");
    expect(res.status).toBe(429);
    const hit = captured.find((row) => row.event === "rate_limit");
    expect(hit?.outcome).toBe("denied");
    expect(hit?.status).toBe(429);
    expect(hit?.action).toBe("rate_limit");
  });
});

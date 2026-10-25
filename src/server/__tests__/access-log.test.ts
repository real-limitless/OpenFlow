import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { accessLogMiddleware, classifyHttpStatus } from "../middleware/access-log";
import { observabilityMiddleware } from "../middleware/observability";
import type { AppEnv } from "../middleware/auth";
import { addLogSink, clearLogSinks, configureLogger, type LogRecord } from "../log";
import { requestContext } from "../../lib/observability/request-context";

describe("access log", () => {
  beforeEach(() => {
    clearLogSinks();
    configureLogger({ level: "debug", format: "json" });
  });

  afterEach(() => {
    clearLogSinks();
  });

  it("classifies rate limits, denials, and auth failures", () => {
    expect(classifyHttpStatus(429).event).toBe("rate_limit");
    expect(classifyHttpStatus(403).event).toBe("denial");
    expect(classifyHttpStatus(401).event).toBe("auth_failure");
    expect(classifyHttpStatus(500).event).toBe("error");
    expect(classifyHttpStatus(200).outcome).toBe("success");
  });

  it("emits one JSON line and echoes X-Request-Id", async () => {
    const captured: LogRecord[] = [];
    addLogSink((record) => {
      captured.push(record);
    });
    const app = new Hono<AppEnv>();
    app.use("*", observabilityMiddleware);
    app.use("*", accessLogMiddleware);
    app.post("/api/v1/auth/login", async (c) => {
      const body = (await c.req.json()) as { password?: string; token?: string };
      return c.json({ ok: true, echoed: body.password ? "received" : "missing" });
    });
    app.get("/limited", (c) => c.json({ error: "Too many requests" }, 429));

    const password = "sample-password-value";
    const token = "sample-token-value";
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-123",
        "user-agent": "openflow-test",
        host: "example.com",
        authorization: "Bearer sample-token-value",
        cookie: "session=sample",
      },
      body: JSON.stringify({ password, token, apiKey: "of_" + "ab".repeat(20) }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-123");
    const access = captured.filter((row) => row.msg === "http_request");
    expect(access).toHaveLength(1);
    const line = JSON.parse(JSON.stringify(access[0])) as Record<string, unknown>;
    for (const field of [
      "ts",
      "level",
      "service",
      "env",
      "project",
      "event",
      "request_id",
      "actor",
      "client_ip",
      "user_agent",
      "host",
      "path",
      "method",
      "status",
      "action",
      "outcome",
    ]) {
      expect(line).toHaveProperty(field);
    }
    expect(line.request_id).toBe("req-123");
    expect(line.path).toBe("/api/v1/auth/login");
    expect(line.method).toBe("POST");
    expect(line.status).toBe(200);
    expect(line.user_agent).toBe("openflow-test");
    expect(line.host).toBe("example.com");
    expect(String(line.ts)).toMatch(/Z$/);
    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("Bearer sample-token-value");
    expect(serialized).not.toContain("session=sample");
    expect(requestContext.getStore()).toBeUndefined();

    const again = await app.request("/limited");
    expect(again.status).toBe(429);
    const rate = captured.filter((row) => row.msg === "http_request" && row.status === 429);
    expect(rate).toHaveLength(1);
    expect(rate[0].event).toBe("rate_limit");
    expect(rate[0].outcome).toBe("denied");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  addLogSink,
  clearLogSinks,
  configureLogger,
  createDatadogLogSink,
  createHttpLogSink,
  getRecentLogs,
  log,
  type LogRecord,
} from "../log";

describe("E7 structured logging", () => {
  beforeEach(() => {
    clearLogSinks();
    configureLogger({ level: "debug", format: "json" });
  });

  afterEach(() => {
    clearLogSinks();
  });

  it("emits records to sinks with correlation fields", () => {
    const captured: LogRecord[] = [];
    addLogSink((r) => {
      captured.push(r);
    });

    log.info("hello", { executionId: "ex1", workflowId: "wf1" });

    expect(captured).toHaveLength(1);
    expect(captured[0].msg).toBe("hello");
    expect(captured[0].level).toBe("info");
    expect(captured[0].executionId).toBe("ex1");
    expect(captured[0].workflowId).toBe("wf1");
    expect(captured[0].service).toBeTruthy();
    expect(captured[0].ts).toMatch(/^\d{4}-/);
  });

  it("respects min level", () => {
    configureLogger({ level: "warn" });
    const captured: LogRecord[] = [];
    addLogSink((r) => {
      captured.push(r);
    });

    log.info("skip");
    log.warn("keep");

    expect(captured.map((r) => r.msg)).toEqual(["keep"]);
  });

  it("child logger merges base fields", () => {
    const captured: LogRecord[] = [];
    addLogSink((r) => {
      captured.push(r);
    });
    const child = log.child({ component: "worker", executionId: "e9" });
    child.error("failed", { error: "boom" });

    expect(captured[0].component).toBe("worker");
    expect(captured[0].executionId).toBe("e9");
    expect(captured[0].error).toBe("boom");
  });

  it("writes one JSON object with the standard fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    log.info("hello-json", { executionId: "ex1" });
    expect(spy).toHaveBeenCalled();
    const line = String(spy.mock.calls.at(-1)?.[0]);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.msg).toBe("hello-json");
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    for (const field of [
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
      expect(parsed).toHaveProperty(field);
    }
    expect(parsed.project).toBe(process.env.LOG_PROJECT?.trim() || "real-limitless");
    expect(["development", "production"]).toContain(parsed.env);
    spy.mockRestore();
  });

  it("redacts passwords, tokens, api keys, cookies, and authorization", () => {
    const captured: LogRecord[] = [];
    addLogSink((r) => {
      captured.push(r);
    });
    const password = "sample-password-value";
    const token = "sample-token-value";
    const apiKey = "of_" + "ab".repeat(24);
    const cookie = "session=sample-cookie";
    const authorization = "Bearer sample-token-value";
    log.info("sensitive", {
      password,
      token,
      apiKey,
      cookie,
      authorization,
      body: { client_secret: "sample-secret", nested: { passwd: password } },
    });
    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain(cookie);
    expect(serialized).not.toContain(authorization);
    expect(serialized).not.toContain("sample-secret");
    expect(captured[0].password).toBe("[redacted]");
    expect(captured[0].authorization).toBe("[redacted]");
    expect(captured[0].cookie).toBe("[redacted]");
    expect((captured[0].body as { client_secret: string }).client_secret).toBe("[redacted]");
  });

  it("keeps recent ring buffer", () => {
    log.info("a");
    log.info("b");
    const recent = getRecentLogs(10);
    expect(recent.some((r) => r.msg === "a")).toBe(true);
    expect(recent.some((r) => r.msg === "b")).toBe(true);
  });

  it("HTTP sink POSTs JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const sink = createHttpLogSink("https://logs.test/ingest");
    sink({
      ts: new Date().toISOString(),
      level: "info",
      msg: "stream-me",
      service: "openflow",
      env: "development",
      project: "real-limitless",
      event: "",
      request_id: null,
      actor: null,
      client_ip: null,
      user_agent: null,
      host: null,
      path: null,
      method: null,
      status: null,
      action: "",
      outcome: "",
      executionId: "ex",
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://logs.test/ingest");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.msg).toBe("stream-me");

    vi.unstubAllGlobals();
  });

  it("Datadog sink hits intake with API key", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const sink = createDatadogLogSink({ apiKey: "dd-key", site: "datadoghq.com" });
    sink({
      ts: "2026-01-01T00:00:00.000Z",
      level: "error",
      msg: "dd-msg",
      service: "openflow",
      env: "development",
      project: "real-limitless",
      event: "",
      request_id: null,
      actor: null,
      client_ip: null,
      user_agent: null,
      host: null,
      path: null,
      method: null,
      status: null,
      action: "",
      outcome: "",
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("http-intake.logs.datadoghq.com");
    const headers = init.headers as Record<string, string>;
    expect(headers["DD-API-KEY"]).toBe("dd-key");
    const body = JSON.parse(String(init.body));
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].message).toBe("dd-msg");

    vi.unstubAllGlobals();
  });
});

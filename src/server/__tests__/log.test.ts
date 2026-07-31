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
    addLogSink((r) => captured.push(r));

    log.info("skip");
    log.warn("keep");

    expect(captured.map((r) => r.msg)).toEqual(["keep"]);
  });

  it("child logger merges base fields", () => {
    const captured: LogRecord[] = [];
    addLogSink((r) => captured.push(r));
    const child = log.child({ component: "worker", executionId: "e9" });
    child.error("failed", { error: "boom" });

    expect(captured[0].component).toBe("worker");
    expect(captured[0].executionId).toBe("e9");
    expect(captured[0].error).toBe("boom");
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
      executionId: "ex",
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
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
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("http-intake.logs.datadoghq.com");
    const headers = init.headers as Record<string, string>;
    expect(headers["DD-API-KEY"]).toBe("dd-key");
    const body = JSON.parse(String(init.body));
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].message).toBe("dd-msg");

    vi.unstubAllGlobals();
  });
});

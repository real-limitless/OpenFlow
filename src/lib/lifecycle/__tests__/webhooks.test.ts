import { describe, expect, it } from "vitest";
import {
  deliverLifecyclePayload,
  mapLifecycleEvent,
  parseLifecycleSubscriptions,
  signLifecycleBody,
  subscriptionWants,
  verifyLifecycleSignature,
} from "../webhooks";

describe("mapLifecycleEvent", () => {
  it("maps finished status to succeeded/failed/waiting", () => {
    expect(mapLifecycleEvent({ type: "execution.started", workflowId: "w", executionId: "e" })).toBe(
      "execution.started",
    );
    expect(
      mapLifecycleEvent({
        type: "execution.finished",
        workflowId: "w",
        executionId: "e",
        status: "success",
      }),
    ).toBe("execution.succeeded");
    expect(
      mapLifecycleEvent({
        type: "execution.finished",
        workflowId: "w",
        executionId: "e",
        status: "waiting",
      }),
    ).toBe("execution.waiting");
    expect(
      mapLifecycleEvent({
        type: "execution.finished",
        workflowId: "w",
        executionId: "e",
        status: "error",
      }),
    ).toBe("execution.failed");
  });
});

describe("lifecycle HMAC", () => {
  it("signs timestamp.body and rejects skew", () => {
    const ts = "1000000";
    const body = JSON.stringify({ event: "execution.started" });
    const sig = signLifecycleBody("s3cret", ts, body);
    expect(sig.startsWith("sha256=")).toBe(true);
    expect(
      verifyLifecycleSignature({
        secret: "s3cret",
        timestamp: ts,
        body,
        signature: sig,
        nowMs: 1_000_000,
      }),
    ).toBe(true);
    expect(
      verifyLifecycleSignature({
        secret: "s3cret",
        timestamp: ts,
        body,
        signature: sig,
        nowMs: 1_000_000 + 10 * 60_000,
      }),
    ).toBe(false);
  });
});

describe("deliverLifecyclePayload", () => {
  it("posts signed JSON and retries until ok", async () => {
    const calls: Array<{ headers: Record<string, string>; body: string }> = [];
    let n = 0;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      n += 1;
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string>;
      if (h) Object.assign(headers, h);
      calls.push({ headers, body: String(init?.body) });
      if (n < 2) return { ok: false, status: 500 } as Response;
      return { ok: true, status: 202 } as Response;
    }) as typeof fetch;

    const sub = parseLifecycleSubscriptions([
      { id: "sub-1", url: "http://example.test/hook", secret: "k", events: ["execution.succeeded"] },
    ])[0]!;
    expect(subscriptionWants(sub, "execution.succeeded")).toBe(true);
    expect(subscriptionWants(sub, "execution.started")).toBe(false);

    const result = await deliverLifecyclePayload({
      fetchImpl,
      sub,
      event: "execution.succeeded",
      payload: { workflowId: "wf", executionId: "ex" },
      nowMs: 42,
      retries: 3,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(calls[0]?.headers["X-OpenFlow-Signature"]?.startsWith("sha256=")).toBe(true);
    expect(calls[0]?.headers["X-OpenFlow-Event"]).toBe("execution.succeeded");
    expect(JSON.parse(calls[0]!.body).executionId).toBe("ex");
  });
});

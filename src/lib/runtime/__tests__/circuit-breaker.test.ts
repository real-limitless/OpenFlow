import { describe, expect, it } from "vitest";
import {
  CircuitBreakerRegistry,
  CircuitOpenError,
  breakerKeysForHttp,
  isTripStatus,
  parseCircuitBreakerConfig,
} from "../circuit-breaker";

describe("isTripStatus", () => {
  it("trips on 429 and 5xx only", () => {
    expect(isTripStatus(429)).toBe(true);
    expect(isTripStatus(500)).toBe(true);
    expect(isTripStatus(503)).toBe(true);
    expect(isTripStatus(404)).toBe(false);
    expect(isTripStatus(200)).toBe(false);
  });
});

describe("breakerKeysForHttp", () => {
  it("keys host and credential ids", () => {
    expect(breakerKeysForHttp("https://API.Example.com/v1", { httpHeaderAuth: { id: "cred-1" } })).toEqual([
      "host:api.example.com",
      "credential:cred-1",
    ]);
  });
});

describe("CircuitBreakerRegistry", () => {
  it("opens after the failure threshold then blocks", () => {
    let now = 1_000;
    const br = new CircuitBreakerRegistry(
      { enabled: true, failureThreshold: 2, cooldownMs: 10_000, halfOpenMaxCalls: 1, ignoreHosts: [] },
      () => now,
    );
    const keys = ["host:storm.example"];
    br.assertAllowed(keys);
    br.recordFailure(keys, 503);
    br.assertAllowed(keys);
    br.recordFailure(keys, 503);
    expect(() => br.assertAllowed(keys)).toThrow(CircuitOpenError);
    const snap = br.list().find((s) => s.key === "host:storm.example");
    expect(snap?.state).toBe("open");
    expect(snap?.failures).toBe(2);

    now += 10_000;
    br.assertAllowed(keys);
    expect(br.list()[0]?.state).toBe("half_open");
    br.recordSuccess(keys);
    expect(br.list()[0]?.state).toBe("closed");
  });

  it("half-open failure re-opens", () => {
    let now = 5_000;
    const br = new CircuitBreakerRegistry(
      { enabled: true, failureThreshold: 1, cooldownMs: 1_000, halfOpenMaxCalls: 1, ignoreHosts: [] },
      () => now,
    );
    const keys = ["credential:abc"];
    br.recordFailure(keys, 429);
    now += 1_000;
    br.assertAllowed(keys);
    br.recordFailure(keys, 429);
    expect(() => br.assertAllowed(keys)).toThrow(/credential:abc/);
  });

  it("honors ignoreHosts and reset", () => {
    const br = new CircuitBreakerRegistry({
      enabled: true,
      failureThreshold: 1,
      cooldownMs: 30_000,
      halfOpenMaxCalls: 1,
      ignoreHosts: ["ok.example"],
    });
    br.recordFailure(["host:ok.example"], 500);
    br.assertAllowed(["host:ok.example"]);
    br.recordFailure(["host:other.example"], 500);
    expect(() => br.assertAllowed(["host:other.example"])).toThrow(CircuitOpenError);
    br.reset("host:other.example");
    br.assertAllowed(["host:other.example"]);
  });
});

describe("parseCircuitBreakerConfig", () => {
  it("reads env overlays", () => {
    const cfg = parseCircuitBreakerConfig(
      { enabled: true, failureThreshold: 9 },
      {
        OPENFLOW_CIRCUIT_BREAKER: "false",
        OPENFLOW_CIRCUIT_FAILURE_THRESHOLD: "3",
        OPENFLOW_CIRCUIT_COOLDOWN_MS: "5000",
      },
    );
    expect(cfg.enabled).toBe(false);
    expect(cfg.failureThreshold).toBe(3);
    expect(cfg.cooldownMs).toBe(5000);
  });
});

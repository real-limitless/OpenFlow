import { afterEach, describe, expect, it } from "vitest";
import { ipInCidr, requestIp, resolveClientIp } from "../client-ip";

const envKeys = ["TRUSTED_PROXY_COUNT", "TRUSTED_PROXY_CIDRS"] as const;
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function rememberEnv() {
  for (const key of envKeys) saved[key] = process.env[key];
  delete process.env.TRUSTED_PROXY_COUNT;
  delete process.env.TRUSTED_PROXY_CIDRS;
}

describe("resolveClientIp", () => {
  it("ignores a spoofed X-Forwarded-For and CF-Connecting-IP from an untrusted peer", () => {
    rememberEnv();
    const ip = resolveClientIp({
      remoteAddress: "203.0.113.9",
      forwardedFor: "1.2.3.4, 198.51.100.10",
      cfConnectingIp: "198.51.100.7",
      trustedProxyCount: 0,
      trustedProxyCidrs: [],
    });
    expect(ip).toBe("203.0.113.9");
  });

  it("uses the right-most untrusted hop when TRUSTED_PROXY_COUNT is set", () => {
    const ip = resolveClientIp({
      remoteAddress: "10.0.0.8",
      forwardedFor: "1.2.3.4, 203.0.113.50",
      trustedProxyCount: 1,
      trustedProxyCidrs: [],
    });
    expect(ip).toBe("203.0.113.50");
  });

  it("skips two trusted hops and still ignores a prepended spoof", () => {
    const ip = resolveClientIp({
      remoteAddress: "10.0.0.8",
      forwardedFor: "9.9.9.9, 203.0.113.50, 10.0.0.2",
      trustedProxyCount: 2,
      trustedProxyCidrs: [],
    });
    expect(ip).toBe("203.0.113.50");
  });

  it("falls back to the socket when the trusted chain is shorter than the header claims", () => {
    const ip = resolveClientIp({
      remoteAddress: "10.0.0.8",
      forwardedFor: "1.2.3.4",
      trustedProxyCount: 2,
      trustedProxyCidrs: [],
    });
    expect(ip).toBe("10.0.0.8");
  });

  it("prefers CF-Connecting-IP only when the immediate peer is trusted", () => {
    const trusted = resolveClientIp({
      remoteAddress: "10.0.0.8",
      forwardedFor: "1.2.3.4, 203.0.113.50",
      cfConnectingIp: "198.51.100.7",
      trustedProxyCount: 1,
      trustedProxyCidrs: [],
    });
    expect(trusted).toBe("198.51.100.7");

    const untrusted = resolveClientIp({
      remoteAddress: "203.0.113.9",
      forwardedFor: "1.2.3.4",
      cfConnectingIp: "198.51.100.7",
      trustedProxyCount: 0,
      trustedProxyCidrs: [],
    });
    expect(untrusted).toBe("203.0.113.9");
  });

  it("walks CIDR-trusted hops from the right and stops at the client", () => {
    expect(ipInCidr("10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(ipInCidr("203.0.113.50", "10.0.0.0/8")).toBe(false);
    const ip = resolveClientIp({
      remoteAddress: "10.0.0.8",
      forwardedFor: "9.9.9.9, 203.0.113.50, 10.0.0.2",
      cfConnectingIp: "not-an-ip",
      trustedProxyCount: 0,
      trustedProxyCidrs: ["10.0.0.0/8"],
    });
    expect(ip).toBe("203.0.113.50");
  });

  it("does not trust headers when the socket is outside TRUSTED_PROXY_CIDRS", () => {
    const ip = resolveClientIp({
      remoteAddress: "203.0.113.9",
      forwardedFor: "1.2.3.4, 198.51.100.10",
      trustedProxyCidrs: ["10.0.0.0/8"],
      trustedProxyCount: 5,
    });
    expect(ip).toBe("203.0.113.9");
  });

  it("reads TRUSTED_PROXY_COUNT from the environment", () => {
    rememberEnv();
    process.env.TRUSTED_PROXY_COUNT = "1";
    expect(
      resolveClientIp({
        remoteAddress: "10.0.0.8",
        forwardedFor: "1.2.3.4, 203.0.113.50",
      }),
    ).toBe("203.0.113.50");
  });
});

describe("requestIp", () => {
  it("records the socket address and drops a spoofed forwarding header", () => {
    rememberEnv();
    const ip = requestIp({
      env: { incoming: { socket: { remoteAddress: "203.0.113.9" } } },
      req: {
        header: (name: string) => {
          if (name === "x-forwarded-for") return "1.2.3.4, 198.51.100.10";
          if (name === "cf-connecting-ip") return "198.51.100.7";
          return undefined;
        },
      },
    });
    expect(ip).toBe("203.0.113.9");
  });

  it("returns null when there is no socket and no trusted proxy", () => {
    rememberEnv();
    expect(
      requestIp({
        req: {
          header: (name: string) => (name === "x-forwarded-for" ? "1.2.3.4" : undefined),
        },
      }),
    ).toBeNull();
  });
});

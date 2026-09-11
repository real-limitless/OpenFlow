import { describe, expect, it } from "vitest";
import {
  defaultCorsMode,
  parseCorsOrigins,
  resolveCorsOrigin,
  securityHeaderMap,
} from "../http-headers";

describe("parseCorsOrigins", () => {
  it("splits comma and whitespace lists", () => {
    expect(parseCorsOrigins("https://a.example, https://b.example")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });
});

describe("resolveCorsOrigin", () => {
  it("reflects origin in try-out when the allowlist is empty", () => {
    expect(resolveCorsOrigin("https://app.local", [], "try-out-reflect")).toBe("https://app.local");
  });

  it("rejects unknown origins in production allowlist mode", () => {
    expect(resolveCorsOrigin("https://evil.example", ["https://app.example"], "allowlist")).toBe(
      null,
    );
    expect(
      resolveCorsOrigin("https://app.example", ["https://app.example"], "allowlist"),
    ).toBe("https://app.example");
  });
});

describe("defaultCorsMode", () => {
  it("uses an allowlist in production when auth is on", () => {
    expect(defaultCorsMode({ authDisabled: false, nodeEnv: "production" })).toBe("allowlist");
    expect(defaultCorsMode({ authDisabled: true, nodeEnv: "production" })).toBe("try-out-reflect");
  });
});

describe("securityHeaderMap", () => {
  it("sets nosniff and HSTS on HTTPS", () => {
    const h = securityHeaderMap({ https: true, frameable: false });
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(h["Strict-Transport-Security"]).toContain("max-age=");
  });
});

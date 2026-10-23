import { describe, expect, it } from "vitest";
import { apiKeyMaxTtlDays, apiKeyPrefix, resolveApiKeyExpiry } from "../lib/api-key-policy";

const now = new Date("2026-10-23T12:00:00.000Z");

describe("api key lifetime", () => {
  it("defaults the maximum to 90 days", () => {
    expect(apiKeyMaxTtlDays({})).toBe(90);
    expect(apiKeyMaxTtlDays({ API_KEY_MAX_TTL_DAYS: "30" })).toBe(30);
    expect(apiKeyMaxTtlDays({ API_KEY_MAX_TTL_DAYS: "0" })).toBe(90);
  });

  it("keeps the of_ prefix length used as an actor", () => {
    expect(apiKeyPrefix("of_0123456789abcdef")).toBe("of_01234");
  });

  it("applies the default expiry when expiresAt is omitted", () => {
    const result = resolveApiKeyExpiry(undefined, now, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expiresAt.toISOString()).toBe("2027-01-21T12:00:00.000Z");
  });

  it("rejects a lifetime longer than the maximum", () => {
    const result = resolveApiKeyExpiry("2027-06-01T00:00:00.000Z", now, {
      API_KEY_MAX_TTL_DAYS: "30",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/30 days/);
  });

  it("rejects a past expiry", () => {
    const result = resolveApiKeyExpiry("2026-10-01T00:00:00.000Z", now, {});
    expect(result.ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { MemoryRateLimiter, rateLimitBucketForPath } from "../rate-limit";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit then returns retry-after", () => {
    const limiter = new MemoryRateLimiter(2, 60_000);
    const t0 = 1_000_000;
    expect(limiter.take("a", t0).allowed).toBe(true);
    expect(limiter.take("a", t0).allowed).toBe(true);
    const blocked = limiter.take("a", t0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});

describe("rateLimitBucketForPath", () => {
  it("classifies auth, webhook, form, and api", () => {
    expect(rateLimitBucketForPath("/api/v1/auth/login")).toBe("auth");
    expect(rateLimitBucketForPath("/webhook/orders")).toBe("webhook");
    expect(rateLimitBucketForPath("/form/intake")).toBe("form");
    expect(rateLimitBucketForPath("/api/v1/workflows")).toBe("api");
  });
});

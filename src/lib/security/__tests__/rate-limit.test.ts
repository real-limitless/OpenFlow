import { afterEach, describe, expect, it } from "vitest";
import {
  FIXED_WINDOW_LUA,
  MemoryRateLimiter,
  fixedWindowFromCount,
  rateLimitBucketForPath,
  setRedisEvalForTests,
  takeRateLimit,
} from "../rate-limit";

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

describe("Redis fixed window", () => {
  afterEach(() => {
    setRedisEvalForTests(null);
    delete process.env.REDIS_URL;
  });

  it("maps a counter and TTL into allow or deny", () => {
    expect(fixedWindowFromCount(1, 2, 60_000).allowed).toBe(true);
    expect(fixedWindowFromCount(2, 2, 60_000).remaining).toBe(0);
    const blocked = fixedWindowFromCount(3, 2, 1500);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(2);
    expect(FIXED_WINDOW_LUA).toContain("INCR");
    expect(FIXED_WINDOW_LUA).toContain("PEXPIRE");
  });

  it("uses Redis EVAL when REDIS_URL is set", async () => {
    process.env.REDIS_URL = "redis://:placeholder@127.0.0.1:6379";
    setRedisEvalForTests(async (_script, numKeys, key, window) => {
      expect(numKeys).toBe(1);
      expect(key).toBe("rl:api:203.0.113.9");
      expect(window).toBe("60000");
      return [121, 4000];
    });
    const blocked = await takeRateLimit("api", "api:203.0.113.9");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(4);
  });

  it("falls back to memory when Redis EVAL throws", async () => {
    process.env.REDIS_URL = "redis://:placeholder@127.0.0.1:6379";
    setRedisEvalForTests(async () => {
      throw new Error("redis down");
    });
    const key = `api:fallback-${Date.now()}`;
    const result = await takeRateLimit("api", key);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(120);
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

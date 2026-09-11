import { describe, expect, it } from "vitest";
import {
  MemoryIdempotencyStore,
  idempotencyRedisKey,
  readIdempotencyKey,
} from "../webhook-idempotency";

describe("readIdempotencyKey", () => {
  it("reads Idempotency-Key or X-Idempotency-Key", () => {
    expect(readIdempotencyKey({ "idempotency-key": " abc " })).toBe("abc");
    expect(readIdempotencyKey({ "x-idempotency-key": "k2" })).toBe("k2");
    expect(readIdempotencyKey({})).toBeNull();
    expect(readIdempotencyKey(new Headers({ "Idempotency-Key": "H" }))).toBe("H");
  });
});

describe("MemoryIdempotencyStore", () => {
  it("returns the first execution within the window", () => {
    const store = new MemoryIdempotencyStore(1_000);
    const key = idempotencyRedisKey("orders", "k1");
    expect(store.get(key, 0)).toBeNull();
    store.set(key, "ex1", 0);
    expect(store.get(key, 500)).toBe("ex1");
    expect(store.get(key, 1_001)).toBeNull();
  });
});

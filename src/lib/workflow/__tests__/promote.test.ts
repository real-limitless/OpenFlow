import { describe, expect, it } from "vitest";
import { canPromoteTo, mergeActivation } from "../promote";

describe("promotion policy", () => {
  it("requires an owner or admin for production", () => {
    expect(canPromoteTo({ actorRole: "member", toSlug: "production" })).toBe(false);
    expect(canPromoteTo({ actorRole: "admin", toSlug: "production" })).toBe(true);
    expect(canPromoteTo({ actorRole: "member", toSlug: "staging" })).toBe(true);
  });

  it("merges env activation ids", () => {
    expect(mergeActivation(["a"], "b")).toEqual(["a", "b"]);
    expect(mergeActivation(["a"], "a")).toEqual(["a"]);
  });
});

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { safeEqual, verifyPkceS256 } from "../tokens";

describe("pkce", () => {
  it("verifies S256 challenge", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256(verifier + "x", challenge)).toBe(false);
  });

  it("safeEqual rejects length mismatch", () => {
    expect(safeEqual("a", "ab")).toBe(false);
    expect(safeEqual("ab", "ab")).toBe(true);
  });
});

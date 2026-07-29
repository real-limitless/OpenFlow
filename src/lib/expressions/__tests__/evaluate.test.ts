import { describe, it, expect } from "vitest";
import { evaluateExpression, isExpression } from "../evaluate";
import type { ExpressionContext } from "../evaluate";

const baseCtx: ExpressionContext = {
  json: { name: "Alice", score: 95 },
  itemIndex: 0,
};

describe("evaluateExpression smoke tests", () => {
  it("passes through a plain string literal", () => {
    const r = evaluateExpression("hello", baseCtx);
    expect(r.ok).toBe(true);
    expect(r.literal).toBe(true);
    expect(r.value).toBe("hello");
  });

  it("evaluates a non-string value as literal", () => {
    const r = evaluateExpression(42, baseCtx);
    expect(r.ok).toBe(true);
    expect(r.literal).toBe(true);
    expect(r.value).toBe(42);
  });

  it("resolves {{ $json.name }} from pinned data", () => {
    const r = evaluateExpression("={{ $json.name }}", baseCtx);
    expect(r.ok).toBe(true);
    expect(r.literal).toBe(false);
    expect(r.value).toBe("Alice");
  });

  it("resolves {{ $json.score }} as a number", () => {
    const r = evaluateExpression("={{ $json.score }}", baseCtx);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(95);
  });

  it("resolves $json.field with = prefix (no braces)", () => {
    const r = evaluateExpression("=$json.name", baseCtx);
    expect(r.ok).toBe(true);
    expect(r.value).toBe("Alice");
  });

  it("resolves a node reference with $node accessor", () => {
    const ctx: ExpressionContext = {
      ...baseCtx,
      nodeData: {
        "Lookup User": [{ json: { email: "a@b.com" } }],
      },
    };
    const r = evaluateExpression('={{ $node("Lookup User").first().json.email }}', ctx);
    expect(r.ok).toBe(true);
    expect(r.value).toBe("a@b.com");
  });

  it("returns ok:false with error on bad expression", () => {
    const r = evaluateExpression("={{ invalid[[[ }}", baseCtx);
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });

  it("returns ok:true with fallback for =expr that throws", () => {
    const r = evaluateExpression("=$nonexistent.deep", baseCtx);
    expect(r.ok).toBe(true);
  });

  it("interpolates multiple braces in one string", () => {
    const r = evaluateExpression("Hi {{ $json.name }} score={{ $json.score }}", baseCtx);
    expect(r.ok).toBe(true);
    expect(r.value).toBe("Hi Alice score=95");
  });
});

describe("isExpression", () => {
  it("detects = prefix", () => {
    expect(isExpression("={{ 1 }}")).toBe(true);
    expect(isExpression("=$json.x")).toBe(true);
  });

  it("detects {{ }}", () => {
    expect(isExpression("{{ $json.x }}")).toBe(true);
  });

  it("rejects plain strings", () => {
    expect(isExpression("hello")).toBe(false);
    expect(isExpression("{{")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isExpression(123)).toBe(false);
    expect(isExpression(null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  normalizeResourceLocator,
  requireScalarLocatorValue,
  resolveChatModelId,
  unwrapResourceLocator,
} from "../resource-locator";

function spreadStringCorruption(legacy: string, next: { mode: string; value: string }) {
  const indexed: Record<string, string> = {};
  for (let i = 0; i < legacy.length; i++) indexed[String(i)] = legacy[i]!;
  return { ...indexed, ...next };
}

describe("unwrapResourceLocator", () => {
  it("returns a plain string unchanged", () => {
    expect(unwrapResourceLocator("anthropic/claude-sonnet-4.5")).toBe(
      "anthropic/claude-sonnet-4.5",
    );
  });

  it("unwraps { __rl, mode, value }", () => {
    expect(unwrapResourceLocator({ __rl: true, mode: "list", value: "openai/gpt-4o" })).toBe(
      "openai/gpt-4o",
    );
  });

  it("unwraps a value-only locator object", () => {
    expect(unwrapResourceLocator({ value: "claude-opus-4-1" })).toBe("claude-opus-4-1");
  });

  it("unwraps editor-written { mode, value } without __rl", () => {
    expect(
      unwrapResourceLocator({ mode: "list", value: "nvidia/nemotron-3.5-lightning:free" }),
    ).toBe("nvidia/nemotron-3.5-lightning:free");
  });

  it("unwraps a spread-string corrupted object via .value", () => {
    const corrupted = spreadStringCorruption("anthropic/claude-sonnet-4.5", {
      mode: "list",
      value: "nvidia/nemotron-3.5-lightning:free",
    });
    expect(corrupted["0"]).toBe("a");
    expect(unwrapResourceLocator(corrupted)).toBe("nvidia/nemotron-3.5-lightning:free");
  });

  it("leaves unrelated objects alone so callers can error clearly", () => {
    const leftover = { foo: 1 };
    expect(unwrapResourceLocator(leftover)).toBe(leftover);
  });
});

describe("normalizeResourceLocator", () => {
  it("promotes a legacy string instead of spreading it", () => {
    const rl = normalizeResourceLocator("anthropic/claude-sonnet-4.5");
    expect(rl).toEqual({ __rl: true, mode: "id", value: "anthropic/claude-sonnet-4.5" });
    const edited = normalizeResourceLocator({ ...rl, value: "nvidia/nemotron-3.5-lightning:free" });
    expect(edited).toEqual({
      __rl: true,
      mode: "id",
      value: "nvidia/nemotron-3.5-lightning:free",
    });
    expect(Object.keys(edited).some((key) => /^\d+$/.test(key))).toBe(false);
  });

  it("repairs a previously corrupted spread-string object", () => {
    const corrupted = spreadStringCorruption("anthropic/claude-sonnet-4.5", {
      mode: "list",
      value: "nvidia/nemotron-3.5-lightning:free",
    });
    expect(normalizeResourceLocator(corrupted)).toEqual({
      __rl: true,
      mode: "list",
      value: "nvidia/nemotron-3.5-lightning:free",
    });
  });

  it("stamps __rl on editor-written { mode, value }", () => {
    expect(normalizeResourceLocator({ mode: "url", value: "https://example.test/m" })).toEqual({
      __rl: true,
      mode: "url",
      value: "https://example.test/m",
    });
  });
});

describe("requireScalarLocatorValue", () => {
  it("throws a JSON preview instead of coercing objects to [object Object]", () => {
    expect(() => requireScalarLocatorValue({ foo: 1 }, "OpenRouter Chat Model: model id")).toThrow(
      /OpenRouter Chat Model: model id resolved to a non-string value: \{.*"foo":1.*\}/,
    );
  });

  it("rejects empty values", () => {
    expect(() => requireScalarLocatorValue("", "OpenRouter Chat Model: model id")).toThrow(
      "OpenRouter Chat Model: model id is required",
    );
  });
});

describe("resolveChatModelId", () => {
  it("evaluates expressions against the first input item", () => {
    const id = resolveChatModelId(
      {
        getParam: () => ({ mode: "id", value: "={{ $json.or_model }}" }),
        getInputItems: () => [{ json: { or_model: "google/gemini-2.0-flash-exp" } }],
        evaluate: (expr, json) => {
          expect(expr).toBe("={{ $json.or_model }}");
          return json.or_model;
        },
      },
      "OpenRouter Chat Model: model id",
    );
    expect(id).toBe("google/gemini-2.0-flash-exp");
  });
});

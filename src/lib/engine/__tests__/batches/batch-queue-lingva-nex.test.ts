import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.lingvaNex";

function makeNodeWithParams(
  params: Record<string, unknown>,
): INode {
  return makeNode({ name: "N", type: TYPE, parameters: params }) as INode;
}

function mockApi(translation: string, from?: string) {
  const body: Record<string, unknown> = { translation };
  if (from) body.from = from;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      status: 200,
      headers: { forEach() {} },
      async text() {
        return JSON.stringify(body);
      },
    })),
  );
}

function mockApiError(status: number, errorBody: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      status,
      headers: { forEach() {} },
      async text() {
        return JSON.stringify(errorBody);
      },
    })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue lingvaNex — n8n-nodes-base.lingvaNex", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("LingvaNex");
  });

  it("throws when text parameter is missing", async () => {
    await expect(
      runNode(TYPE, { translateTo: "fr" }, [{}]),
    ).rejects.toThrow("Text parameter is required");
  });

  it("throws when translateTo parameter is missing", async () => {
    await expect(
      runNode(TYPE, { text: "Hello" }, [{}]),
    ).rejects.toThrow("Translate To parameter is required");
  });

  it("throws when credential is not configured", async () => {
    await expect(
      runNode(TYPE, { text: "Hello", translateTo: "fr" }, [{}]),
    ).rejects.toThrow(/Credential.*lingvaNexApi.*not configured/);
  });

  it("calls the LingvaNex API and returns translated text with detected language", async () => {
    mockApi("Bonjour le monde", "en");

    const node = makeNodeWithParams({ text: "Hello world", translateTo: "fr" });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test", name: "test", active: false,
        nodes: [node], connections: {}, settings: {},
      },
      getNodeInputItems: () => [{ json: { sourceText: "Hello world" } }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-api-key" }),
    });

    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.translation).toBe("Bonjour le monde");
    expect(out[0][0].json.detectedLanguage).toBe("en");
    expect(out[0][0].json.sourceText).toBe("Hello world");
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
  });

  it("calls the API with explicit source language (no detectedLanguage)", async () => {
    mockApi("Good morning");

    const node = makeNodeWithParams({
      text: "Guten Morgen", translateFrom: "de", translateTo: "en",
    });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test", name: "test", active: false,
        nodes: [node], connections: {}, settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-api-key" }),
    });

    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);

    expect(out[0][0].json.translation).toBe("Good morning");
    expect(out[0][0].json.detectedLanguage).toBeUndefined();
  });

  it("processes multiple input items independently", async () => {
    mockApi("Hola");

    const node = makeNodeWithParams({ text: "={{ $json.msg }}", translateTo: "es" });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test", name: "test", active: false,
        nodes: [node], connections: {}, settings: {},
      },
      getNodeInputItems: () => [{ json: { msg: "Hello" } }, { json: { msg: "Goodbye" } }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-api-key" }),
    });

    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.translation).toBe("Hola");
    expect(out[0][0].json.msg).toBe("Hello");
    expect(out[0][1].json.translation).toBe("Hola");
    expect(out[0][1].json.msg).toBe("Goodbye");
  });

  it("throws on API error response", async () => {
    mockApiError(400, { error: "invalid language code" });

    const node = makeNodeWithParams({ text: "Hello", translateTo: "invalid" });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test", name: "test", active: false,
        nodes: [node], connections: {}, settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-api-key" }),
    });

    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");

    await expect(executor(ctx, node)).rejects.toThrow(/LingvaNex API error/);
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.lingvaNex")).toBe(canonical);
  });
});

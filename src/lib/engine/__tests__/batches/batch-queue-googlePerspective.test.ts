import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googlePerspective";
const PERSPECTIVE_URL = "https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze";

function mockAnalyzeResponse(extraAttrs: Record<string, unknown> = {}) {
  return {
    attributeScores: {
      toxicity: {
        spanScores: [{ begin: 0, end: 16, score: { value: 0.9, scoreType: "probability" } }],
        summaryScore: { value: 0.9, scoreType: "probability" },
      },
      ...extraAttrs,
    },
    languages: ["en"],
  };
}

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", forEach: () => {} },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

let fetchCalls: Array<{ url: string; body?: string }> = [];

function installFetch(routes: Record<string, unknown>, status?: number) {
  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      fetchCalls.push({ url, body: opts?.body as string | undefined });
      if (url === PERSPECTIVE_URL && PERSPECTIVE_URL in routes) {
        return mockJsonResponse(routes[PERSPECTIVE_URL], status ?? 200);
      }
      if (url in routes) {
        return mockJsonResponse(routes[url], status ?? 200);
      }
      return mockJsonResponse(null, 404);
    }),
  );
}

beforeEach(() => {
  fetchCalls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue Google Perspective — n8n-nodes-base.googlePerspective", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.displayName).toBe("Google Perspective");
  });

  it("analyzes a comment and returns attributeScores", async () => {
    installFetch({ [PERSPECTIVE_URL]: mockAnalyzeResponse() });

    const [output] = await runNode(
      TYPE,
      {
        operation: "analyzeComment",
        text: "={{ $json.comment }}",
        requestedAttributesUi: {
          requestedAttributesValues: [{ attributeName: "toxicity", scoreThreshold: 0 }],
        },
      },
      [{ json: { comment: "You are an idiot" } }],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.attributeScores).toBeDefined();
    expect(output[0].json.attributeScores.toxicity).toBeDefined();
    expect(output[0].json.attributeScores.toxicity.summaryScore.value).toBeGreaterThan(0);
    expect(output[0].json.attributeScores.toxicity.summaryScore.value).toBeLessThanOrEqual(1);
  });

  it("analyzes with multiple attributes", async () => {
    installFetch({
      [PERSPECTIVE_URL]: mockAnalyzeResponse({
        insult: {
          spanScores: [{ begin: 0, end: 30, score: { value: 0.1, scoreType: "probability" } }],
          summaryScore: { value: 0.1, scoreType: "probability" },
        },
        profanity: {
          spanScores: [{ begin: 0, end: 30, score: { value: 0.05, scoreType: "probability" } }],
          summaryScore: { value: 0.05, scoreType: "probability" },
        },
        threat: {
          spanScores: [{ begin: 0, end: 30, score: { value: 0.01, scoreType: "probability" } }],
          summaryScore: { value: 0.01, scoreType: "probability" },
        },
      }),
    });

    const [output] = await runNode(
      TYPE,
      {
        operation: "analyzeComment",
        text: "={{ $json.comment }}",
        requestedAttributesUi: {
          requestedAttributesValues: [
            { attributeName: "toxicity" },
            { attributeName: "insult" },
            { attributeName: "profanity" },
            { attributeName: "threat" },
          ],
        },
      },
      [{ json: { comment: "I really enjoyed this article" } }],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.attributeScores.toxicity).toBeDefined();
    expect(output[0].json.attributeScores.insult).toBeDefined();
    expect(output[0].json.attributeScores.profanity).toBeDefined();
    expect(output[0].json.attributeScores.threat).toBeDefined();
  });

  it("resolves expression-based attribute selection", async () => {
    installFetch({ [PERSPECTIVE_URL]: mockAnalyzeResponse() });

    const [output] = await runNode(
      TYPE,
      {
        operation: "analyzeComment",
        text: "Bad comment",
        requestedAttributesUi: {
          requestedAttributesValues: [{ attributeName: "={{ $json.attr }}" }],
        },
      },
      [{ json: { attr: "toxicity" } }],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.attributeScores.toxicity).toBeDefined();
    expect(output[0].json.attributeScores.toxicity.summaryScore.value).toBeGreaterThan(0);
  });

  it("defaults to toxicity when no attributes specified", async () => {
    installFetch({ [PERSPECTIVE_URL]: mockAnalyzeResponse() });

    const [output] = await runNode(
      TYPE,
      {
        operation: "analyzeComment",
        text: "Some comment",
        requestedAttributesUi: { requestedAttributesValues: [] },
      },
      [{ json: {} }],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.attributeScores.toxicity).toBeDefined();
  });

  it("throws on empty text", async () => {
    installFetch({ [PERSPECTIVE_URL]: mockAnalyzeResponse() });

    await expect(
      runNode(
        TYPE,
        { operation: "analyzeComment", text: "" },
        [{ json: { comment: "" } }],
      ),
    ).rejects.toThrow(/empty/i);
  });

  it("throws on whitespace-only text", async () => {
    installFetch({ [PERSPECTIVE_URL]: mockAnalyzeResponse() });

    await expect(
      runNode(
        TYPE,
        { operation: "analyzeComment", text: "   " },
        [{ json: {} }],
      ),
    ).rejects.toThrow(/empty/i);
  });

  it("handles API error with continueOnFail", async () => {
    installFetch(
      { [PERSPECTIVE_URL]: { error: { message: "API quota exceeded" } } },
      403,
    );

    const [output] = await runNode(
      TYPE,
      {
        operation: "analyzeComment",
        text: "test",
        requestedAttributesUi: {
          requestedAttributesValues: [{ attributeName: "toxicity" }],
        },
      },
      [{ json: { comment: "test" } }],
      { continueOnFail: true },
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.error).toBeDefined();
  });

  it("includes pairedItem on output items", async () => {
    installFetch({ [PERSPECTIVE_URL]: mockAnalyzeResponse() });

    const [output] = await runNode(
      TYPE,
      {
        operation: "analyzeComment",
        text: "={{ $json.comment }}",
        requestedAttributesUi: {
          requestedAttributesValues: [{ attributeName: "toxicity" }],
        },
      },
      [
        { json: { comment: "First" } },
        { json: { comment: "Second" } },
      ],
    );

    expect(output).toHaveLength(2);
    expect(output[0].pairedItem).toEqual({ item: 0, input: 0 });
    expect(output[1].pairedItem).toEqual({ item: 1, input: 0 });
  });
});

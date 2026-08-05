import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googlePerspective";
const CREDS = { googlePerspectiveOAuth2Api: { accessToken: "tok_perspective" } };

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: new Map(),
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

type Handler = (
  url: string,
  method: string,
  body?: unknown,
) => ReturnType<typeof mockResponse>;
let handler: Handler;
let lastBody: unknown;

function installFetch(h: Handler) {
  handler = h;
  lastBody = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      lastBody = body;
      return handler(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googlePerspectiveOAuth2Api: { name: "googlePerspectiveOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googlePerspective executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("analyze a toxic comment", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, unknown>;
      if (method === "POST" && url.includes("comments:analyze")) {
        expect((b.comment as Record<string, unknown>).text).toBe("You are an idiot and everyone hates you.");
        return mockResponse({
          attributeScores: {
            toxicity: {
              summaryScore: { value: 0.95, type: "probability" },
              spanScores: [{ begin: 0, end: 5, score: { value: 0.8, type: "probability" } }],
            },
          },
          languages: ["en"],
          detectedLanguages: ["en"],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      operation: "analyzeComment",
      text: "You are an idiot and everyone hates you.",
      requestedAttributesUi: {
        requestedAttributesValues: [
          { attributeName: "toxicity", scoreThreshold: 0 },
        ],
      },
    });

    expect(out[0][0].json).toHaveProperty("perspective");
    const result = out[0][0].json.perspective as Record<string, unknown>;
    const attributeScores = result.attributeScores as Record<string, unknown>;
    expect(attributeScores).toHaveProperty("toxicity");
    const toxicity = attributeScores.toxicity as Record<string, unknown>;
    const summaryScore = toxicity.summaryScore as Record<string, unknown>;
    expect(summaryScore.value).toBeGreaterThan(0.5);
  });

  it("multiple attributes with threshold", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, unknown>;
      if (method === "POST" && url.includes("comments:analyze")) {
        const reqAttrs = b.requestedAttributes as Record<string, unknown>;
        expect(reqAttrs).toHaveProperty("toxicity");
        expect(reqAttrs).toHaveProperty("threat");
        expect(reqAttrs).toHaveProperty("flirtation");
        return mockResponse({
          attributeScores: {
            toxicity: { summaryScore: { value: 0.85, type: "probability" } },
            threat: { summaryScore: { value: 0.72, type: "probability" } },
          },
          languages: ["en"],
          detectedLanguages: ["en"],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      operation: "analyzeComment",
      text: "I will find you and hurt you.",
      requestedAttributesUi: {
        requestedAttributesValues: [
          { attributeName: "toxicity", scoreThreshold: 0.3 },
          { attributeName: "threat", scoreThreshold: 0.3 },
          { attributeName: "flirtation", scoreThreshold: 0.7 },
        ],
      },
    });

    const result = out[0][0].json.perspective as Record<string, unknown>;
    const attributeScores = result.attributeScores as Record<string, unknown>;
    expect(attributeScores).toHaveProperty("toxicity");
    expect(attributeScores).toHaveProperty("threat");
    expect(attributeScores).not.toHaveProperty("flirtation");
  });

  it("empty text returns scores with value 0", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, unknown>;
      if (method === "POST" && url.includes("comments:analyze")) {
        expect((b.comment as Record<string, unknown>).text).toBe("");
        return mockResponse({
          attributeScores: {
            toxicity: { summaryScore: { value: 0, type: "probability" } },
          },
          languages: ["en"],
          detectedLanguages: ["en"],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      operation: "analyzeComment",
      text: "",
      requestedAttributesUi: {
        requestedAttributesValues: [
          { attributeName: "toxicity", scoreThreshold: 0 },
        ],
      },
    });

    const result = out[0][0].json.perspective as Record<string, unknown>;
    const attributeScores = result.attributeScores as Record<string, unknown>;
    const toxicity = attributeScores.toxicity as Record<string, unknown>;
    const summaryScore = toxicity.summaryScore as Record<string, unknown>;
    expect(summaryScore.value).toBe(0);
  });

  it("language option is passed to API", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, unknown>;
      if (method === "POST" && url.includes("comments:analyze")) {
        expect(b.languages).toEqual(["es"]);
        return mockResponse({
          attributeScores: {
            toxicity: { summaryScore: { value: 0.7, type: "probability" } },
          },
          languages: ["es"],
          detectedLanguages: ["es"],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      operation: "analyzeComment",
      text: "Eres un idiota.",
      requestedAttributesUi: {
        requestedAttributesValues: [
          { attributeName: "toxicity", scoreThreshold: 0 },
        ],
      },
      options: {
        languages: "es",
      },
    });

    const result = out[0][0].json.perspective as Record<string, unknown>;
    expect(result).toHaveProperty("attributeScores");
  });

  it("throws on API error", async () => {
    installFetch(() => mockResponse({ error: { message: "API quota exceeded" } }, 403));
    await expect(
      run({
        operation: "analyzeComment",
        text: "test",
        requestedAttributesUi: {
          requestedAttributesValues: [
            { attributeName: "toxicity", scoreThreshold: 0 },
          ],
        },
      }),
    ).rejects.toThrow("API quota exceeded");
  });

  it("continueOnFail emits error item", async () => {
    installFetch(() => mockResponse({ error: { message: "API error" } }, 500));
    const out = await run(
      {
        operation: "analyzeComment",
        text: "test",
        requestedAttributesUi: {
          requestedAttributesValues: [
            { attributeName: "toxicity", scoreThreshold: 0 },
          ],
        },
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.any(String) });
  });
});

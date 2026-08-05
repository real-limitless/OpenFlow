import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleCloudNaturalLanguage";
const CREDS = { googleCloudNaturalLanguageOAuth2Api: { accessToken: "tok_nl" } };

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

function installFetch(h: Handler) {
  handler = h;
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
    credentials: { googleCloudNaturalLanguageOAuth2Api: { name: "googleCloudNaturalLanguageOAuth2Api" } },
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

describe("googleCloudNaturalLanguage executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("analyzes inline text sentiment", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("documents:analyzeSentiment")) {
        const b = body as Record<string, unknown>;
        expect((b.document as Record<string, unknown>).content).toBe(
          "I love this product, it is absolutely wonderful!",
        );
        return mockResponse({
          documentSentiment: { score: 0.9, magnitude: 0.9 },
          language: "en",
          sentences: [
            {
              text: { content: "I love this product, it is absolutely wonderful!", beginOffset: 0 },
              sentiment: { score: 0.9, magnitude: 0.9 },
            },
          ],
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        documentType: "content",
        textContent: "I love this product, it is absolutely wonderful!",
        inputLanguage: "",
        encodingType: "UTF8",
      },
      [{}],
    );
    expect(out[0][0].json).toMatchObject({
      documentSentiment: { score: 0.9, magnitude: 0.9 },
      language: "en",
    });
  });

  it("per-item expression binding", async () => {
    let callCount = 0;
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("documents:analyzeSentiment")) {
        callCount++;
        const b = body as Record<string, unknown>;
        const text = (b.document as Record<string, unknown>).content as string;
        return mockResponse({
          documentSentiment: {
            score: text.includes("Great") ? 0.8 : -0.6,
            magnitude: 0.9,
          },
          language: "en",
          sentences: [
            {
              text: { content: text, beginOffset: 0 },
              sentiment: {
                score: text.includes("Great") ? 0.8 : -0.6,
                magnitude: 0.9,
              },
            },
          ],
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        documentType: "content",
        textContent: "={{ $json.review }}",
        inputLanguage: "",
        encodingType: "UTF8",
      },
      [
        { review: "Great service!" },
        { review: "Terrible experience." },
      ],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({
      documentSentiment: { score: 0.8 },
    });
    expect(out[0][1].json).toMatchObject({
      documentSentiment: { score: -0.6 },
    });
  });

  it("throws on missing text content", async () => {
    await expect(
      run(
        {
          documentType: "content",
          textContent: "",
          inputLanguage: "",
          encodingType: "UTF8",
        },
        [{}],
      ),
    ).rejects.toThrow("Text content is required");
  });

  it("throws on API error", async () => {
    installFetch(() => mockResponse({ error: { message: "API disabled" } }, 403));
    await expect(
      run(
        {
          documentType: "content",
          textContent: "hello",
          inputLanguage: "",
          encodingType: "UTF8",
        },
        [{}],
      ),
    ).rejects.toThrow("API disabled");
  });

  it("continueOnFail emits error item", async () => {
    installFetch(() => mockResponse({ error: { message: "API disabled" } }, 403));
    const out = await run(
      {
        documentType: "content",
        textContent: "hello",
        inputLanguage: "",
        encodingType: "UTF8",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("API disabled") });
  });
});

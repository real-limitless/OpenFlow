import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleCloudNaturalLanguageTool";
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

describe("googleCloudNaturalLanguageTool executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("analyzes inline text sentiment", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("documents:analyzeSentiment")) {
        const b = body as Record<string, unknown>;
        expect((b.document as Record<string, unknown>).content).toBe(
          "The team delivered an outstanding result this quarter.",
        );
        return mockResponse({
          documentSentiment: { score: 0.9, magnitude: 0.9 },
          language: "en",
          sentences: [
            {
              text: { content: "The team delivered an outstanding result this quarter.", beginOffset: 0 },
              sentiment: { score: 0.9, magnitude: 0.9 },
            },
          ],
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        resource: "document",
        operation: "analyzeSentiment",
        documentSource: "text",
        text: "The team delivered an outstanding result this quarter.",
        options: { language: "en" },
      },
      [{}],
    );
    expect(out[0][0].json).toMatchObject({
      sentiment: {
        documentSentiment: { score: 0.9, magnitude: 0.9 },
        language: "en",
      },
    });
  });

  it("reads text from jsonInputField", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("documents:analyzeSentiment")) {
        const b = body as Record<string, unknown>;
        expect((b.document as Record<string, unknown>).content).toBe("Amazing work!");
        return mockResponse({
          documentSentiment: { score: 0.8, magnitude: 0.8 },
          language: "en",
          sentences: [],
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        resource: "document",
        operation: "analyzeSentiment",
        documentSource: "fromJson",
        jsonInputField: "review",
        options: {},
      },
      [{ review: "Amazing work!" }],
    );
    expect(out[0][0].json).toMatchObject({
      sentiment: { documentSentiment: { score: 0.8 } },
    });
  });

  it("throws on missing text content", async () => {
    await expect(
      run(
        {
          resource: "document",
          operation: "analyzeSentiment",
          documentSource: "text",
          text: "",
          options: {},
        },
        [{}],
      ),
    ).rejects.toThrow("Document text is required");
  });

  it("throws on API error", async () => {
    installFetch(() => mockResponse({ error: { message: "API disabled" } }, 403));
    await expect(
      run(
        {
          resource: "document",
          operation: "analyzeSentiment",
          documentSource: "text",
          text: "hello",
          options: {},
        },
        [{}],
      ),
    ).rejects.toThrow("API disabled");
  });

  it("continueOnFail emits error item", async () => {
    installFetch(() => mockResponse({ error: { message: "API disabled" } }, 403));
    const out = await run(
      {
        resource: "document",
        operation: "analyzeSentiment",
        documentSource: "text",
        text: "hello",
        options: {},
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("API disabled") });
  });

  it("sends language code and encoding type from options", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("documents:analyzeSentiment")) {
        const b = body as Record<string, unknown>;
        expect((b.document as Record<string, unknown>).languageCode).toBe("es");
        expect(b.encodingType).toBe("UTF16");
        return mockResponse({
          documentSentiment: { score: -0.2, magnitude: 0.5 },
          language: "es",
          sentences: [],
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        resource: "document",
        operation: "analyzeSentiment",
        documentSource: "text",
        text: "No me gusta.",
        options: { language: "es", encodingType: "UTF16" },
      },
      [{}],
    );
    expect(out[0][0].json).toMatchObject({
      sentiment: { documentSentiment: { score: -0.2 } },
    });
  });
});

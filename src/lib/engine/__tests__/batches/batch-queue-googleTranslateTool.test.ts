import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleTranslateTool";
const CREDS = { googleTranslateOAuth2Api: { accessToken: "tok_translate" } };

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
    credentials: { googleTranslateOAuth2Api: { name: "googleTranslateOAuth2Api" } },
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

describe("googleTranslateTool executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("basic translate EN to FR", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, string>;
      if (method === "POST" && url.includes("translate/v2")) {
        expect(b.q).toBe("Hello world");
        expect(b.target).toBe("fr");
        return mockResponse({
          data: {
            translations: [
              { translatedText: "Bonjour le monde", detectedSourceLanguage: "en" },
            ],
          },
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        text: "={{ $json.source }}",
        translateTo: "fr",
      },
      [{ source: "Hello world" }],
    );
    expect(out[0][0].json).toEqual({
      source: "Hello world",
      translation: {
        detectedSourceLanguage: "en",
        translatedText: "Bonjour le monde",
      },
    });
  });

  it("literal text, auto-detect source", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, string>;
      if (method === "POST" && url.includes("translate/v2")) {
        expect(b.q).toBe("Wie geht es Ihnen?");
        expect(b.target).toBe("en");
        return mockResponse({
          data: {
            translations: [
              { translatedText: "How are you?", detectedSourceLanguage: "de" },
            ],
          },
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        text: "Wie geht es Ihnen?",
        translateTo: "en",
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({
      translation: {
        detectedSourceLanguage: "de",
        translatedText: "How are you?",
      },
    });
  });

  it("empty text fails", async () => {
    await expect(
      run(
        { text: "", translateTo: "en" },
        [{}],
      ),
    ).rejects.toThrow();
  });

  it("invalid target language fails", async () => {
    installFetch(() => mockResponse({ error: { message: "invalid language code" } }, 400));
    await expect(
      run(
        { text: "Hello", translateTo: "zz" },
        [{}],
      ),
    ).rejects.toThrow("invalid language code");
  });

  it("continueOnFail passes error item through", async () => {
    installFetch(() => mockResponse({ error: { message: "invalid language code" } }, 400));
    const out = await run(
      { text: "Hello", translateTo: "zz" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.any(String) });
  });
});

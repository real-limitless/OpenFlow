import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleTranslate";
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

describe("googleTranslate executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("basic translation", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, string>;
      if (method === "POST" && url.includes("translate/v2")) {
        return mockResponse({
          data: {
            translations: [
              { translatedText: "Hola mundo", detectedSourceLanguage: "en" },
            ],
          },
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        text: "Hello world",
        translateTo: "es",
        translateFrom: "en",
      },
      [{ source: "Hello world" }],
    );
    expect(out[0][0].json).toEqual({
      translatedText: "Hola mundo",
      detectedSourceLanguage: "en",
    });
  });

  it("auto-detect source language", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, string>;
      if (method === "POST" && url.includes("translate/v2")) {
        expect(b.source).toBeUndefined();
        return mockResponse({
          data: {
            translations: [
              { translatedText: "Hello world", detectedSourceLanguage: "fr" },
            ],
          },
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        text: "Bonjour le monde",
        translateTo: "en",
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({
      translatedText: "Hello world",
      detectedSourceLanguage: "fr",
    });
  });

  it("per-item expression evaluation", async () => {
    let callCount = 0;
    installFetch((url, method, body) => {
      const b = body as Record<string, string>;
      if (method === "POST" && url.includes("translate/v2")) {
        callCount++;
        return mockResponse({
          data: {
            translations: [
              {
                translatedText:
                  callCount === 1 ? "Guten Morgen" : "Bonne nuit",
                detectedSourceLanguage: "en",
              },
            ],
          },
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        text: "={{ $json.msg }}",
        translateTo: "={{ $json.target }}",
      },
      [
        { msg: "Good morning", target: "de" },
        { msg: "Good night", target: "fr" },
      ],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({
      translatedText: "Guten Morgen",
      detectedSourceLanguage: "en",
    });
    expect(out[0][1].json).toEqual({
      translatedText: "Bonne nuit",
      detectedSourceLanguage: "en",
    });
  });

  it("continueOnFail emits error item", async () => {
    const out = await run(
      {
        text: "hello",
        translateTo: "",
        options: {},
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("translateTo") });
  });

  it("throws on missing required parameter", async () => {
    await expect(
      run(
        { text: "hello", translateTo: "" },
        [{}],
      ),
    ).rejects.toThrow();
  });

  it("throws on API error", async () => {
    installFetch(() => mockResponse({ error: { message: "invalid language code" } }, 400));
    await expect(
      run(
        { text: "hello", translateTo: "invalid" },
        [{}],
      ),
    ).rejects.toThrow("invalid language code");
  });
});
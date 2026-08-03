import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.deepL";
const CREDS = { deepLApi: { apiKey: "test-key-123", plan: "pro" } };

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
    credentials: { deepLApi: { name: "deepLApi" } },
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

describe("deepL executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("basic translation", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, string>;
      if (method === "POST" && url.includes("api.deepl.com")) {
        expect(b.text).toBe("Hello, world!");
        expect(b.target_lang).toBe("DE");
        return mockResponse({
          translations: [{ detected_source_language: "EN", text: "Hallo, Welt!" }],
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        text: "Hello, world!",
        translateTo: "DE",
      },
      [{ sourceText: "Hello, world!" }],
    );
    expect(out[0][0].json).toEqual({
      detected_source_language: "EN",
      text: "Hallo, Welt!",
    });
  });

  it("translation with optional fields", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, string>;
      if (method === "POST" && url.includes("api.deepl.com")) {
        expect(b.source_lang).toBe("EN");
        expect(b.formality).toBe("less");
        expect(b.split_sentences).toBe("1");
        return mockResponse({
          translations: [{ detected_source_language: "EN", text: "Comment vas-tu ?" }],
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        text: "How are you?",
        translateTo: "FR",
        additionalFields: { sourceLang: "EN", formality: "less", splitSentences: "1" },
      },
      [{ sourceText: "How are you?" }],
    );
    expect(out[0][0].json).toEqual({
      detected_source_language: "EN",
      text: "Comment vas-tu ?",
    });
  });

  it("auto-detected source language", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, string>;
      if (method === "POST" && url.includes("api.deepl.com")) {
        expect(b.source_lang).toBeUndefined();
        return mockResponse({
          translations: [{ detected_source_language: "FR", text: "Hello world" }],
        });
      }
      return mockResponse({});
    });
    const out = await run(
      { text: "Bonjour le monde", translateTo: "EN" },
      [{ sourceText: "Bonjour le monde" }],
    );
    expect(out[0][0].json).toEqual({
      detected_source_language: "FR",
      text: "Hello world",
    });
  });

  it("preserve formatting", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, string>;
      if (method === "POST" && url.includes("api.deepl.com")) {
        expect(b.preserve_formatting).toBe("1");
        return mockResponse({
          translations: [{ detected_source_language: "EN", text: "der QUICK braune Fuchs" }],
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        text: "the QUICK Brown Fox",
        translateTo: "DE",
        additionalFields: { preserveFormatting: "1" },
      },
      [{ sourceText: "the QUICK Brown Fox" }],
    );
    expect(out[0][0].json).toEqual({
      detected_source_language: "EN",
      text: "der QUICK braune Fuchs",
    });
  });

  it("per-item expression evaluation", async () => {
    let callCount = 0;
    installFetch((url, method, body) => {
      const b = body as Record<string, string>;
      if (method === "POST" && url.includes("api.deepl.com")) {
        callCount++;
        return mockResponse({
          translations: [
            {
              detected_source_language: "EN",
              text: callCount === 1 ? "Guten Morgen" : "Bonne nuit",
            },
          ],
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
        { msg: "Good morning", target: "DE" },
        { msg: "Good night", target: "FR" },
      ],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({
      detected_source_language: "EN",
      text: "Guten Morgen",
    });
    expect(out[0][1].json).toEqual({
      detected_source_language: "EN",
      text: "Bonne nuit",
    });
  });

  it("continueOnFail emits error item", async () => {
    const out = await run(
      { text: "hello", translateTo: "" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.any(String) });
  });

  it("throws on missing required parameter", async () => {
    await expect(
      run({ text: "hello", translateTo: "" }, [{}]),
    ).rejects.toThrow();
  });

  it("throws on API error", async () => {
    installFetch(() => mockResponse({ message: "Invalid target language" }, 400));
    await expect(
      run({ text: "hello", translateTo: "INVALID" }, [{}]),
    ).rejects.toThrow("Invalid target language");
  });
});

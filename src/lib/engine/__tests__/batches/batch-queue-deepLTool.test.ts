import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.deepLTool";
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

describe("deepLTool executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("agent translates text via tool", async () => {
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
      [{}],
    );
    expect(out[0][0].json).toEqual({
      detected_source_language: "EN",
      text: "Hallo, Welt!",
    });
  });

  it("agent supplies optional fields", async () => {
    installFetch((url, method, body) => {
      const b = body as Record<string, string>;
      if (method === "POST" && url.includes("api.deepl.com")) {
        expect(b.text).toBe("How are you?");
        expect(b.target_lang).toBe("FR");
        expect(b.source_lang).toBe("EN");
        expect(b.formality).toBe("less");
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
        additionalFields: { sourceLang: "EN", formality: "less" },
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({
      detected_source_language: "EN",
      text: "Comment vas-tu ?",
    });
  });

  it("agent passes invalid language — error thrown", async () => {
    installFetch(() => mockResponse({ message: "Invalid target language" }, 400));
    await expect(
      run({ text: "Hello", translateTo: "INVALID" }, [{}]),
    ).rejects.toThrow("Invalid target language");
  });

  it("continueOnFail emits error item", async () => {
    const out = await run(
      { text: "hello", translateTo: "" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.any(String) });
  });
});

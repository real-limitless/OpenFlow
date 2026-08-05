import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeCtx } from "../helpers";
import type { INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.linkedInTool";

// linkedInTool re-exports linkedInExecutor, which resolves this credential
// before it does anything else. Mirrors CREDS in batch-queue-linkedin.test.ts.
const CREDS = { linkedInOAuth2Api: { accessToken: "mock-token" } };

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function installFetch(resp?: ReturnType<typeof mockResponse>) {
  nextResponse = resp ?? mockResponse({ id: "urn:li:post:abc123" });
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return nextResponse;
  }));
}

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("linkedInTool executor", () => {
  it("is registered for n8n-nodes-base.linkedInTool", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
  });

  it("has a node description registered", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc?.name).toBe(TYPE);
  });

  it("delegates to linkedin executor (text-only person post)", async () => {
    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        authentication: "Standard",
        postAs: "Person",
        person: "urn:li:person:abcdefg",
        text: "Hello LinkedIn!",
        mediaCategory: "None",
      },
    });
    const ctx = makeCtx([{ json: {} }], node, false, CREDS);
    const result = await executor(ctx, node);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(calls.length).toBeGreaterThanOrEqual(1);

    const postCall = calls.find((c) => c.url.includes("/ugcPosts"));
    expect(postCall).toBeDefined();
    expect(postCall!.method).toBe("POST");

    const body = JSON.parse(postCall!.body ?? "{}");
    expect(body.author).toBe("urn:li:person:abcdefg");
    expect(body.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text).toBe("Hello LinkedIn!");
  });

  it("posts as organization with URN derivation", async () => {
    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        authentication: "Standard",
        postAs: "Organization",
        organization: "03262013",
        text: "Company announcement",
        mediaCategory: "None",
      },
    });
    const ctx = makeCtx([{ json: {} }], node, false, CREDS);
    const result = await executor(ctx, node);

    expect(result).toHaveLength(1);
    const postCall = calls.find((c) => c.url.includes("/ugcPosts"));
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall!.body ?? "{}");
    expect(body.author).toBe("urn:li:organization:03262013");
  });

  it("supports continueOnFail", async () => {
    installFetch(mockResponse({ error: "Unauthorized" }, 401));
    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        authentication: "Standard",
        postAs: "Person",
        person: "urn:li:person:unknown",
        text: "This will fail",
        mediaCategory: "None",
      },
    });
    const ctx = makeCtx([{ json: {} }], node, true, CREDS);
    const result = await executor(ctx, node);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json).toHaveProperty("error");
  });
});

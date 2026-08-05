import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.medium";

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: { get() { return null; }, entries() { return new Map().entries(); } },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

let calls: Array<{ url: string; method: string; body: string | undefined }>;
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response = mockResponse({ data: { id: "post-1", title: "Test", url: "https://medium.com/p/post-1", publishStatus: "draft" } })) {
  nextResponse = response;
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return nextResponse;
  }));
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async () => ({ accessToken: "test-token" }),
  });
}

function toItems(input: Array<Record<string, unknown>>): INodeExecutionData[] {
  return input.map((i) => ({ json: i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue medium — n8n-nodes-base.medium", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Medium");
  });

  it("creates a draft post (acceptance: create draft)", async () => {
    installFetch(mockResponse({
      data: {
        id: "post-abc123",
        title: "Test Post",
        url: "https://medium.com/p/post-abc123",
        canonicalUrl: "",
        publishStatus: "draft",
        license: "all-rights-reserved",
        licenseUrl: "",
        authorId: "user-1",
        tags: ["test"],
        content: { subtitle: "", mediumUrl: "https://medium.com/p/post-abc123" },
      },
    }));

    const node = makeNode({
      name: "Medium",
      type: TYPE,
      parameters: {
        resource: "post",
        operation: "create",
        title: "Test Post",
        contentFormat: "markdown",
        content: "Hello from n8n",
        additionalFields: { publishStatus: "draft", notifyFollowers: false },
      },
    });
    const items = toItems([{}]);
    const ctx = makeCtx(items, node);
    const executor = (await import("../../executors/medium")).mediumExecutor;
    const out = await executor(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("post-abc123");
    expect(out[0][0].json.title).toBe("Test Post");
    expect(out[0][0].json.url).toMatch(/^https:\/\/medium\.com\//);
    expect(out[0][0].json.publishStatus).toBe("draft");
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://api.medium.com/v1/me/posts");
    expect(calls[0].method).toBe("POST");
  });

  it("lists publications (acceptance: list publications)", async () => {
    installFetch(mockResponse({
      data: [
        { id: "pub-1", name: "My Blog", description: "A blog", url: "https://medium.com/my-blog", imageUrl: "", twitterUsername: "" },
      ],
    }));

    const node = makeNode({
      name: "Medium",
      type: TYPE,
      parameters: {
        resource: "publication",
        operation: "getAll",
        userId: "12345",
      },
    });
    const items = toItems([{}]);
    const ctx = makeCtx(items, node);
    const executor = (await import("../../executors/medium")).mediumExecutor;
    const out = await executor(ctx, node);

    expect(Array.isArray(out[0])).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://api.medium.com/v1/users/12345/publications");
  });

  it("returns empty array when no publications", async () => {
    installFetch(mockResponse({ data: [] }));

    const node = makeNode({
      name: "Medium",
      type: TYPE,
      parameters: {
        resource: "publication",
        operation: "getAll",
        userId: "12345",
      },
    });
    const items = toItems([{}]);
    const ctx = makeCtx(items, node);
    const executor = (await import("../../executors/medium")).mediumExecutor;
    const out = await executor(ctx, node);

    expect(Array.isArray(out[0])).toBe(true);
    expect(out[0]).toHaveLength(0);
  });

  it("errors on missing title (acceptance: missing required title)", async () => {
    installFetch();

    const node = makeNode({
      name: "Medium",
      type: TYPE,
      parameters: {
        resource: "post",
        operation: "create",
        contentFormat: "markdown",
        content: "Missing title test",
      },
    });
    const items = toItems([{}]);
    const ctx = makeCtx(items, node);
    const executor = (await import("../../executors/medium")).mediumExecutor;

    await expect(executor(ctx, node)).rejects.toThrow(/title/);
  });

  it("errors on auth failure when continueOnFail is false", async () => {
    installFetch(mockResponse({}, { status: 401 }));

    const node = makeNode({
      name: "Medium",
      type: TYPE,
      parameters: {
        resource: "post",
        operation: "create",
        title: "Test",
        content: "Hello",
      },
    });
    const items = toItems([{}]);
    const ctx = makeCtx(items, node);
    const executor = (await import("../../executors/medium")).mediumExecutor;

    await expect(executor(ctx, node)).rejects.toThrow(/authentication failed/);
  });

  it("returns error item on continueOnFail", async () => {
    installFetch(mockResponse({}, { status: 401 }));

    const node = makeNode({
      name: "Medium",
      type: TYPE,
      parameters: {
        resource: "post",
        operation: "create",
        title: "Test",
        content: "Hello",
      },
    });
    const items = toItems([{}]);
    const ctx = makeCtx(items, node, true);
    const executor = (await import("../../executors/medium")).mediumExecutor;
    const out = await executor(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeDefined();
  });

  it("uses authorId when provided", async () => {
    installFetch(mockResponse({
      data: { id: "post-2", title: "Authored Post", url: "https://medium.com/p/post-2", publishStatus: "public" },
    }));

    const node = makeNode({
      name: "Medium",
      type: TYPE,
      parameters: {
        resource: "post",
        operation: "create",
        title: "Authored Post",
        content: "Hello",
        additionalFields: { authorId: "user-456" },
      },
    });
    const items = toItems([{}]);
    const ctx = makeCtx(items, node);
    const executor = (await import("../../executors/medium")).mediumExecutor;
    const out = await executor(ctx, node);

    expect(out[0][0].json.id).toBe("post-2");
    expect(calls[0].url).toBe("https://api.medium.com/v1/users/user-456/posts");
  });
});

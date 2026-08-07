import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinExecutors } from "../../index";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { discourseToolExecutor } from "../../executors/n8n-nodes-base.discourseTool";
import { createExecutionContext } from "@/sdk";
import { makeNode } from "../helpers";
import { discourseExecutor } from "../../executors/discourse";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.discourseTool";

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: new Map<string, string>([["content-type", "application/json"]]),
    get(name: string) { return this.headers.get(name.toLowerCase()) ?? null; },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
}

let calls: FetchCall[];

function installFetch(response: ReturnType<typeof mockResponse>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return response;
    }),
  );
}

function makeTestCtx(
  parameters: Record<string, unknown>,
  continueOnFail = false,
) {
  const node = makeNode({ name: "DT", type: TYPE, parameters });
  const creds = {
    discourseApi: {
      url: "https://discourse.example.com",
      apiKey: "test-api-key",
      username: "testuser",
    },
  };
  return createExecutionContext({
    node,
    workflow: {
      id: "test",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => [{ json: {} }],
    continueOnFail,
    getCredential: async (name: string) => (creds as Record<string, typeof creds.discourseApi>)[name] ?? null,
  });
}

async function runTool(parameters: Record<string, unknown>) {
  const ctx = makeTestCtx(parameters);
  return discourseToolExecutor(ctx, ctx.node);
}

describe("batch-queue discourseTool — n8n-nodes-base.discourseTool", () => {
  beforeEach(() => {
    installFetch(mockResponse({}));
  });

  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.displayName).toBe("Discourse");
    expect(desc.name).toBe("n8n-nodes-base.discourse");
  });

  it("category create — POST /categories.json", async () => {
    installFetch(mockResponse({ category: { id: 1, name: "TestCategory" } }));
    const out = await runTool({
      resource: "category",
      operation: "create",
      name: "TestCategory",
      color: "FF0000",
      textColor: "FFFFFF",
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/categories.json");
    expect(JSON.parse(calls[0].body!)).toEqual({
      name: "TestCategory",
      color: "FF0000",
      text_color: "FFFFFF",
    });
    expect(out[0][0].json).toHaveProperty("id", 1);
  });

  it("post create — POST /posts.json with raw field mapping", async () => {
    installFetch(mockResponse({ id: 100, raw: "Agent-generated post content" }));
    const out = await runTool({
      resource: "post",
      operation: "create",
      content: "Agent-generated post content",
      title: "AI Post",
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/posts.json");
    const body = JSON.parse(calls[0].body!);
    expect(body).toEqual({
      raw: "Agent-generated post content",
      title: "AI Post",
    });
    expect(out[0][0].json).toHaveProperty("id", 100);
  });

  it("userGroup remove — DELETE /groups/{groupId}/members.json", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await runTool({
      resource: "userGroup",
      operation: "remove",
      usernames: "jdoe",
      groupId: "10",
    });
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/groups/10/members.json");
    expect(JSON.parse(calls[0].body!)).toEqual({ usernames: "jdoe" });
    expect(out[0][0].json).toHaveProperty("success", true);
  });

  it("post get — GET /posts/{postId}", async () => {
    installFetch(mockResponse({ id: 42, raw: "hello" }));
    const out = await runTool({
      resource: "post",
      operation: "get",
      postId: "42",
    });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/posts/42");
    expect(out[0][0].json).toHaveProperty("id", 42);
  });

  it("throws on missing required params", async () => {
    await expect(
      runTool({ resource: "category", operation: "create" }),
    ).rejects.toThrow(/required/);
  });

  it("continues on fail with error item", async () => {
    const ctx = makeTestCtx({ resource: "category", operation: "create" }, true);
    const out = await discourseToolExecutor(ctx, ctx.node);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("delegates to same discourse executor", () => {
    expect(discourseToolExecutor).toBe(discourseExecutor);
  });
});

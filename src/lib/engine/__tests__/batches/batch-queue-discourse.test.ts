import { describe, it, expect, beforeEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import type { INode } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.discourse";

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
    entries() { return this.headers.entries(); },
    forEach(fn: (v: string, k: string) => void) { this.headers.forEach(fn); },
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

function makeCtx(
  items: INodeExecutionData[],
  parameters: Record<string, unknown>,
): ExecutionContext {
  const node: INode = makeNode({ name: "DiscourseTest", type: TYPE, parameters });
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
    getNodeInputItems: () => items,
    continueOnFail: false,
    getCredential: async (name) => creds[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown>>): INodeExecutionData[] {
  return input.map((i) => ({ json: i }));
}

async function runDiscourse(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
) {
  const items = toItems(inputItems);
  const ctx = makeCtx(items, parameters);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, { ...ctx.node, parameters } as INode);
}

describe("batch-queue discourse — n8n-nodes-base.discourse", () => {
  beforeEach(() => {
    installFetch(mockResponse({}));
  });

  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Discourse");
  });

  it("category create — POST /categories.json with snake_case body", async () => {
    installFetch(mockResponse({ category: { id: 1, name: "TestCategory" } }));
    const out = await runDiscourse({
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

  it("category getAll — GET /categories.json with limit slicing", async () => {
    const cats = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `cat${i}` }));
    installFetch(mockResponse({ category_list: { categories: cats } }));
    const out = await runDiscourse({
      resource: "category",
      operation: "getAll",
      returnAll: false,
      limit: 3,
    });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/categories.json");
    expect((out[0][0].json as any).categories).toHaveLength(3);
  });

  it("post create — POST /posts.json with raw field mapping", async () => {
    installFetch(mockResponse({ id: 100 }));
    const out = await runDiscourse({
      resource: "post",
      operation: "create",
      title: "Hello",
      content: "This is a test post.",
      additionalFields: { topic_id: "42", reply_to_post_number: "1" },
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/posts.json");
    const body = JSON.parse(calls[0].body!);
    expect(body).toEqual({
      title: "Hello",
      raw: "This is a test post.",
      topic_id: "42",
      reply_to_post_number: "1",
    });
    expect(out[0][0].json).toHaveProperty("id", 100);
  });

  it("post get — GET /posts/{postId}", async () => {
    installFetch(mockResponse({ id: 42, raw: "hello" }));
    const out = await runDiscourse({
      resource: "post",
      operation: "get",
      postId: "42",
    });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/posts/42");
    expect(out[0][0].json).toHaveProperty("id", 42);
  });

  it("user getAll with flag and options — GET /admin/users/list/active.json", async () => {
    const users = Array.from({ length: 30 }, (_, i) => ({ id: i, username: `user${i}` }));
    installFetch(mockResponse(users));
    const out = await runDiscourse({
      resource: "user",
      operation: "getAll",
      flag: "active",
      returnAll: false,
      limit: 25,
      options: { order: "username", asc: true, showEmails: true },
    });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/admin/users/list/active.json");
    expect(calls[0].url).toContain("order=username");
    expect(calls[0].url).toContain("asc=true");
    expect(calls[0].url).toContain("show_emails=true");
    expect((out[0][0].json as any).users).toHaveLength(25);
  });

  it("userGroup add — PUT /groups/{groupId}/members.json", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await runDiscourse({
      resource: "userGroup",
      operation: "add",
      usernames: "alice,bob",
      groupId: "5",
    });
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toContain("/groups/5/members.json");
    expect(JSON.parse(calls[0].body!)).toEqual({ usernames: "alice,bob" });
    expect(out[0][0].json).toHaveProperty("success", true);
  });

  it("userGroup remove — DELETE /groups/{groupId}/members.json", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await runDiscourse({
      resource: "userGroup",
      operation: "remove",
      usernames: "charlie",
      groupId: "3",
    });
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/groups/3/members.json");
    expect(JSON.parse(calls[0].body!)).toEqual({ usernames: "charlie" });
  });

  it("throws on missing required params", async () => {
    await expect(
      runDiscourse({ resource: "category", operation: "create" }),
    ).rejects.toThrow(/required/);
  });

  it("continues on fail with error item", async () => {
    const node: INode = makeNode({ name: "N", type: TYPE, parameters: { resource: "category", operation: "create" } });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("processes multiple input items", async () => {
    installFetch(mockResponse({ category: { id: 1 } }));
    const out = await runDiscourse(
      {
        resource: "category",
        operation: "create",
        name: "Test",
        color: "FF0000",
        textColor: "FFFFFF",
      },
      [{}, {}],
    );
    expect(out[0]).toHaveLength(2);
  });
});

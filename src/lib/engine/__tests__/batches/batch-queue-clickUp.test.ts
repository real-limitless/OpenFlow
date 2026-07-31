import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.clickUp";

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : status === 204 ? "No Content" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get() {
        return null;
      },
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
  headers: Record<string, string>;
}

let calls: FetchCall[];

function installFetch(
  responses:
    ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  const responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const body =
        typeof init?.body === "string"
          ? init.body
          : init?.body
            ? JSON.stringify(init.body)
            : undefined;
      const headers = (init?.headers as Record<string, string>) ?? {};
      calls.push({ url: String(url), method: init?.method ?? "GET", body, headers });
      const next = responseQueue.shift() ?? mockResponse({});
      return next;
    }),
  );
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

describe("batch-queue clickUp — n8n-nodes-base.clickUp", () => {
  beforeEach(() => {
    installFetch(mockResponse({ id: "task_001", name: "Test task from n8n" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("ClickUp");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.clickUp")).toBe(getExecutor(TYPE));
  });

  describe("task create", () => {
    it("creates a task via POST /list/{listId}/task", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "task",
          operation: "create",
          workspace: { __rl: true, value: "workspaceId", mode: "id" },
          space: { __rl: true, value: "spaceId", mode: "id" },
          list: { __rl: true, value: "listId", mode: "id" },
          taskName: "Test task from n8n",
          taskDescription: "Created by automated test",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: {
          id: "test",
          name: "test",
          active: false,
          nodes: [node],
          connections: {},
          settings: {},
        },
        getNodeInputItems: () => [{ json: { name: "Test task from n8n" } }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "task_001" });
      const call = lastCall();
      expect(call.url).toContain("/api/v2/list/listId/task");
      expect(call.method).toBe("POST");
      expect(call.body).toContain("Test task from n8n");
    });
  });

  describe("task get with options", () => {
    it("gets a task with subtasks and markdown flags", async () => {
      installFetch(
        mockResponse({
          id: "abc123",
          name: "Task",
          subtasks: [],
          markdown_description: "## Markdown",
        }),
      );
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "task",
          operation: "get",
          workspace: { __rl: true, value: "workspaceId", mode: "id" },
          space: { __rl: true, value: "spaceId", mode: "id" },
          list: { __rl: true, value: "listId", mode: "id" },
          taskId: "abc123",
          includeSubtasks: true,
          includeMarkdownDescription: true,
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: {
          id: "test",
          name: "test",
          active: false,
          nodes: [node],
          connections: {},
          settings: {},
        },
        getNodeInputItems: () => [{ json: { taskId: "abc123" } }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ subtasks: [], markdown_description: "## Markdown" });
      const call = lastCall();
      expect(call.url).toContain("include_subtasks=true");
      expect(call.url).toContain("include_markdown_description=true");
    });
  });

  describe("task getAll with pagination", () => {
    it("paginates through multiple pages and returns one item per task", async () => {
      const page0 = { tasks: [{ id: "task_1" }, { id: "task_2" }] };
      const page1 = { tasks: [{ id: "task_3" }] };
      const page2 = { tasks: [] };
      installFetch([mockResponse(page0), mockResponse(page1), mockResponse(page2)]);
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "task",
          operation: "getAll",
          workspace: { __rl: true, value: "workspaceId", mode: "id" },
          space: { __rl: true, value: "spaceId", mode: "id" },
          list: { __rl: true, value: "listId", mode: "id" },
          limit: 50,
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: {
          id: "test",
          name: "test",
          active: false,
          nodes: [node],
          connections: {},
          settings: {},
        },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(3);
      expect(out[0][0].json).toMatchObject({ id: "task_1" });
      expect(out[0][1].json).toMatchObject({ id: "task_2" });
      expect(out[0][2].json).toMatchObject({ id: "task_3" });
      expect(calls.length).toBe(3);
      expect(calls[0].url).toContain("page=0");
      expect(calls[1].url).toContain("page=1");
      expect(calls[2].url).toContain("page=2");
    });
  });

  describe("comment create", () => {
    it("creates a comment on a task", async () => {
      installFetch(
        mockResponse({ id: "comment_001", comment_text: "This is a test comment from n8n" }),
      );
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "comment",
          operation: "create",
          workspace: { __rl: true, value: "workspaceId", mode: "id" },
          space: { __rl: true, value: "spaceId", mode: "id" },
          commentScope: "task",
          task: "abc123",
          commentText: "This is a test comment from n8n",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: {
          id: "test",
          name: "test",
          active: false,
          nodes: [node],
          connections: {},
          settings: {},
        },
        getNodeInputItems: () => [{ json: { taskId: "abc123" } }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        id: "comment_001",
        comment_text: "This is a test comment from n8n",
      });
      const call = lastCall();
      expect(call.url).toContain("/task/abc123/comment");
      expect(call.method).toBe("POST");
    });
  });

  describe("time entry start and stop", () => {
    it("starts a time entry", async () => {
      installFetch(mockResponse({ id: "te_001", task: { id: "abc123" } }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "timeEntry",
          operation: "start",
          workspace: { __rl: true, value: "workspaceId", mode: "id" },
          space: { __rl: true, value: "spaceId", mode: "id" },
          teTaskId: "abc123",
          teDescription: "Time tracking test",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: {
          id: "test",
          name: "test",
          active: false,
          nodes: [node],
          connections: {},
          settings: {},
        },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "te_001", task: { id: "abc123" } });
    });

    it("stops a time entry", async () => {
      installFetch(mockResponse({ id: "te_002", duration: "60000" }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "timeEntry",
          operation: "stop",
          workspace: { __rl: true, value: "workspaceId", mode: "id" },
          space: { __rl: true, value: "spaceId", mode: "id" },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: {
          id: "test",
          name: "test",
          active: false,
          nodes: [node],
          connections: {},
          settings: {},
        },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "te_002", duration: "60000" });
      expect(lastCall().url).toContain("/time_entries/stop");
      expect(lastCall().method).toBe("POST");
    });
  });

  describe("authentication", () => {
    it("uses pk_ prefix for personal access token", async () => {
      installFetch(mockResponse({ id: "task_001" }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          authentication: "accessToken",
          resource: "task",
          operation: "create",
          workspace: { __rl: true, value: "workspaceId", mode: "id" },
          space: { __rl: true, value: "spaceId", mode: "id" },
          list: { __rl: true, value: "listId", mode: "id" },
          taskName: "Test",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: {
          id: "test",
          name: "test",
          active: false,
          nodes: [node],
          connections: {},
          settings: {},
        },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "my-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await executor(ctx, node);
      const call = lastCall();
      expect(call.url).toContain("/list/listId/task");
      expect(call.headers.Authorization).toBe("pk_my-token");
    });

    it("uses Bearer prefix for OAuth2", async () => {
      installFetch(mockResponse({ id: "task_001" }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          authentication: "oAuth2",
          resource: "task",
          operation: "create",
          workspace: { __rl: true, value: "workspaceId", mode: "id" },
          space: { __rl: true, value: "spaceId", mode: "id" },
          list: { __rl: true, value: "listId", mode: "id" },
          taskName: "Test",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: {
          id: "test",
          name: "test",
          active: false,
          nodes: [node],
          connections: {},
          settings: {},
        },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "oauth-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await executor(ctx, node);
      const call = lastCall();
      expect(call.url).toContain("/list/listId/task");
      expect(call.headers.Authorization).toBe("Bearer oauth-token");
    });
  });

  describe("continueOnFail", () => {
    it("returns error items when continueOnFail is true", async () => {
      installFetch(mockResponse({ err: "not found" }, { status: 404 }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "task",
          operation: "create",
          workspace: { __rl: true, value: "workspaceId", mode: "id" },
          space: { __rl: true, value: "spaceId", mode: "id" },
          list: { __rl: true, value: "listId", mode: "id" },
          taskName: "Test",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: {
          id: "test",
          name: "test",
          active: false,
          nodes: [node],
          connections: {},
          settings: {},
        },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: { message: expect.any(String), code: 500 } });
    });
  });
});

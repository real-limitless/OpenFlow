import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.taiga";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : status === 400 ? "Bad Request" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
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
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

function jsonBody(call: FetchCall): unknown {
  if (!call.body) return undefined;
  try { return JSON.parse(call.body); } catch { return call.body; }
}

describe("batch-queue taiga — n8n-nodes-base.taiga", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Taiga");
  });

  describe("create issue", () => {
    it("sends POST to create an issue and returns the API response", async () => {
      const authResponse = { auth_token: "test-token" };
      const apiResponse = {
        id: 123,
        subject: "Bug: login fails on empty password",
        project: 456,
        status: 1,
        created_date: "2025-01-15T10:00:00Z",
      };
      responseQueue = [mockResponse(authResponse), mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "issue",
          operation: "create",
          projectId: "{{ $json.projectId }}",
          subject: "Bug: login fails on empty password",
          additionalFields: {
            description: "Steps to reproduce...",
            tags: ["bug", "auth"],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { projectId: 456 } }],
        continueOnFail: false,
        getCredential: async () => ({ username: "user", password: "pass", environment: "cloud" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        id: 123,
        subject: "Bug: login fails on empty password",
        project: 456,
      });

      const authCall = calls[0];
      expect(authCall.method).toBe("POST");
      expect(authCall.url).toContain("/auth");

      const createCall = calls[1];
      expect(createCall.method).toBe("POST");
      expect(createCall.url).toContain("/issues");
      expect(createCall.headers.Authorization).toBe("Bearer test-token");
      const body = jsonBody(createCall) as Record<string, unknown>;
      expect(body.project).toBe(456);
      expect(body.subject).toBe("Bug: login fails on empty password");
    });
  });

  describe("getAll epics with filters", () => {
    it("sends GET with query params and returns array", async () => {
      const authResponse = { auth_token: "token" };
      const apiResponse = [
        { id: 1, subject: "Epic 1", project: 123, status: 1, assigned_to: 5 },
        { id: 2, subject: "Epic 2", project: 123, status: 2, assigned_to: 6 },
      ];
      responseQueue = [mockResponse(authResponse), mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "epic",
          operation: "getAll",
          projectId: "{{ $json.projectId }}",
          returnAll: true,
          filters: {
            statusIsClosed: false,
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { projectId: 123 } }],
        continueOnFail: false,
        getCredential: async () => ({ username: "user", password: "pass", environment: "cloud" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const data = out[0][0].json as unknown[];
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);
      expect((data[0] as Record<string, unknown>).subject).toBe("Epic 1");

      const call = lastCall();
      expect(call.method).toBe("GET");
      expect(call.url).toContain("/epics");
      expect(call.url).toContain("project=123");
    });
  });

  describe("delete a task", () => {
    it("sends DELETE and returns success", async () => {
      const authResponse = { auth_token: "token" };
      responseQueue = [mockResponse(authResponse), mockResponse({ success: true }, { status: 204 })];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "task",
          operation: "delete",
          taskId: "{{ $json.taskId }}",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { taskId: 99 } }],
        continueOnFail: false,
        getCredential: async () => ({ username: "user", password: "pass", environment: "cloud" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toEqual({ success: true });

      const call = lastCall();
      expect(call.method).toBe("DELETE");
      expect(call.url).toContain("/tasks/99");
    });
  });

  describe("update a user story", () => {
    it("sends PATCH with update fields", async () => {
      const authResponse = { auth_token: "token" };
      const apiResponse = {
        id: 42,
        subject: "Updated title",
        milestone: 7,
        project: 123,
      };
      responseQueue = [mockResponse(authResponse), mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "userStory",
          operation: "update",
          projectId: "{{ $json.projectId }}",
          userStoryId: "{{ $json.userStoryId }}",
          updateFields: {
            subject: "Updated title",
            milestone: "{{ $json.milestoneId }}",
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { projectId: 123, userStoryId: 42, milestoneId: 7 } }],
        continueOnFail: false,
        getCredential: async () => ({ username: "user", password: "pass", environment: "cloud" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        subject: "Updated title",
        milestone: 7,
      });

      const call = lastCall();
      expect(call.method).toBe("PATCH");
      expect(call.url).toContain("/userstories/42");
      const body = jsonBody(call) as Record<string, unknown>;
      expect(body.subject).toBe("Updated title");
      expect(body.milestone).toBe(7);
    });
  });

  describe("continueOnFail", () => {
    it("returns error item on missing credential", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "issue",
          operation: "get",
          issueId: "1",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("credential") });
    });
  });
});

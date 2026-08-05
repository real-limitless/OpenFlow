import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.clickUpTool";

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
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : undefined,
        headers,
      });
      const next = responseQueue.shift() ?? mockResponse({});
      return next;
    }),
  );
}

function makeCtx(
  items: Array<Record<string, unknown>>,
  node: INode,
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () =>
      items.map((json) => ({ json, pairedItem: { item: 0, input: 0 } })),
    continueOnFail,
    getCredential: async () => ({ accessToken: "pk_test_token" }),
  });
}

describe("clickUpTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    calls = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has registered executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe("n8n-nodes-base.clickUpTool");
    expect(desc.category).toBe("AI Tool");
  });

  it("resolves via alias to clickUp executor", () => {
    const executor = getExecutor(TYPE);
    const clickUpExecutor = getExecutor("n8n-nodes-base.clickUp");
    expect(executor).toBe(clickUpExecutor);
  });

  it("creates a task via tool", async () => {
    installFetch(
      mockResponse({ id: "task123", name: "Task created by AI agent" }),
    );

    const node = makeNode({
      name: "ClickUp Tool",
      type: TYPE,
      parameters: {
        resource: "task",
        operation: "create",
        workspace: { __rl: true, value: "workspaceId", mode: "id" },
        space: { __rl: true, value: "spaceId", mode: "id" },
        list: { __rl: true, value: "listId", mode: "id" },
        taskName: "Task created by AI agent",
      },
    });

    const ctx = makeCtx([{ name: "Task created by AI agent" }], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    expect(output[0].json.id).toBe("task123");
    expect(output[0].json.name).toBe("Task created by AI agent");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/list/listId/task");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.name).toBe("Task created by AI agent");
  });

  it("returns error on API failure with continueOnFail", async () => {
    installFetch(
      mockResponse({ err: "Not found" }, { status: 404 }),
    );

    const node = makeNode({
      name: "ClickUp Tool",
      type: TYPE,
      parameters: {
        resource: "task",
        operation: "create",
        workspace: { __rl: true, value: "invalidWorkspace", mode: "id" },
        space: { __rl: true, value: "invalidSpace", mode: "id" },
        taskName: "Failing task",
      },
    });

    const ctx = makeCtx([{}], node, true);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    expect(output[0].json.error).toBeDefined();
    expect(output[0].json.error.message).toContain("Not found");
  });
});
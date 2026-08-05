import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.clockifyTool";

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
    headers: { get() { return null; } },
    async json() { return JSON.parse(text); },
    async text() { return text; },
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
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  const responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
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
  }));
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
    getCredential: async () => ({ apiKey: "test_api_key" }),
  });
}

describe("clockifyTool", () => {
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
    expect(desc.name).toBe("n8n-nodes-base.clockifyTool");
    expect(desc.category).toBe("AI Tool");
  });

  it("resolves via alias to clockify executor", () => {
    const executor = getExecutor(TYPE);
    const clockifyExecutor = getExecutor("n8n-nodes-base.clockify");
    expect(executor).toBe(clockifyExecutor);
  });

  it("creates a project via tool", async () => {
    installFetch(mockResponse({
      id: "proj_001",
      name: "My Test Project",
      workspaceId: "ws_abc123",
      billable: true,
    }));

    const node = makeNode({
      name: "Clockify Tool",
      type: TYPE,
      parameters: {
        resource: "project",
        operation: "create",
        workspaceId: "ws_abc123",
        name: "My Test Project",
      },
    });

    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    expect(output[0].json.id).toBe("proj_001");
    expect(output[0].json.name).toBe("My Test Project");
    expect(output[0].json.workspaceId).toBe("ws_abc123");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/workspaces/ws_abc123/projects");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.name).toBe("My Test Project");
  });

  it("lists workspaces via tool", async () => {
    installFetch(mockResponse([
      { id: "ws_1", name: "My Workspace" },
      { id: "ws_2", name: "Another Workspace" },
    ]));

    const node = makeNode({
      name: "Clockify Tool",
      type: TYPE,
      parameters: {
        resource: "workspace",
        operation: "getAll",
        returnAll: true,
      },
    });

    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    expect(Array.isArray(output[0].json)).toBe(true);
    expect(output[0].json).toHaveLength(2);
    expect(output[0].json[0].id).toBe("ws_1");
    expect(output[0].json[0].name).toBe("My Workspace");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/workspaces");
  });

  it("returns error on API failure with continueOnFail", async () => {
    installFetch(mockResponse({ message: "Invalid API key" }, { status: 401 }));

    const node = makeNode({
      name: "Clockify Tool",
      type: TYPE,
      parameters: {
        resource: "workspace",
        operation: "getAll",
        returnAll: true,
      },
    });

    const ctx = makeCtx([{}], node, true);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    expect(output[0].json.error).toBeDefined();
  });
});

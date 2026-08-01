import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googleTasksTool";

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
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
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
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ id: "task-1" })) {
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
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return response;
    }),
  );
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
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
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

const CREDS = { googleTasksOAuth2Api: { accessToken: "ya29.task_token_456" } };

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: {
    continueOnFail?: boolean;
    credentials?: Record<string, Record<string, unknown>>;
  },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue googleTasksTool — n8n-nodes-base.googleTasksTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Google Tasks (AI Tool)");
  });

  it("creates a task via POST /lists/@default/tasks", async () => {
    const created = {
      id: "task-1",
      title: "Buy groceries",
      notes: "Milk, eggs, bread",
      status: "needsAction",
      due: "2026-08-15",
    };
    installFetch(mockResponse(created));
    const out = await run({
      resource: "task",
      operation: "create",
      taskListId: "@default",
      title: "Buy groceries",
      notes: "Milk, eggs, bread",
      due: "2026-08-15T00:00:00Z",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks");
    expect(calls[0].headers["Authorization"]).toBe("Bearer ya29.task_token_456");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toMatchObject({
      title: "Buy groceries",
      notes: "Milk, eggs, bread",
    });
    expect(out[0][0].json).toMatchObject(created);
  });

  it("getAll returns array of tasks", async () => {
    const tasksResponse = {
      items: [
        { id: "t1", title: "Buy groceries", status: "needsAction" },
        { id: "t2", title: "Submit report", status: "completed", completed: "2026-08-01T10:00:00.000Z" },
      ],
    };
    installFetch(mockResponse(tasksResponse));
    const out = await run({
      resource: "task",
      operation: "getAll",
      taskListId: "@default",
      returnAll: true,
      showCompleted: true,
      showHidden: false,
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/lists/@default/tasks");
    expect(calls[0].url).toContain("showCompleted=true");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "t1", title: "Buy groceries" });
    expect(out[0][1].json).toMatchObject({ id: "t2", title: "Submit report", status: "completed" });
  });

  it("updates a task via PATCH", async () => {
    installFetch(mockResponse({ id: "abc123", title: "Buy groceries", status: "completed" }));
    const out = await run(
      {
        resource: "task",
        operation: "update",
        taskListId: "@default",
        taskId: "={{ $json.taskId }}",
        status: "completed",
      },
      [{ taskId: "abc123" }],
    );

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toContain("/lists/@default/tasks/abc123");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toMatchObject({ status: "completed" });
    expect(out[0][0].json).toMatchObject({ id: "abc123", status: "completed" });
  });

  it("deletes a task via DELETE", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run(
      {
        resource: "task",
        operation: "delete",
        taskListId: "@default",
        taskId: "={{ $json.taskId }}",
      },
      [{ taskId: "abc123" }],
    );

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/lists/@default/tasks/abc123");
    expect(out[0][0].json).toEqual({});
  });

  it("gets a single task via GET", async () => {
    const taskResponse = { id: "abc123", title: "Buy groceries", status: "needsAction", due: "2026-08-15" };
    installFetch(mockResponse(taskResponse));
    const out = await run(
      {
        resource: "task",
        operation: "get",
        taskListId: "@default",
        taskId: "={{ $json.taskId }}",
      },
      [{ taskId: "abc123" }],
    );

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/lists/@default/tasks/abc123");
    expect(out[0][0].json).toMatchObject(taskResponse);
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "task", operation: "create", title: "Test" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/googleTasksOAuth2Api credential is not configured/);
  });

  it("throws on HTTP error", async () => {
    installFetch(mockResponse({ error: { message: "Task list not found" } }, { status: 404 }));
    await expect(
      run({ resource: "task", operation: "getAll", taskListId: "@default" }),
    ).rejects.toThrow(/Task list not found/);
  });

  it("continueOnFail emits error item and continues", async () => {
    installFetch(mockResponse({ error: { message: "Not found" } }, { status: 404 }));
    const out = await run(
      {
        resource: "task",
        operation: "get",
        taskListId: "@default",
        taskId: "={{ $json.taskId }}",
      },
      [{ taskId: "bad-id" }, { taskId: "valid-id" }],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("error");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.todoistTool";

function mockResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    async text() {
      return text;
    },
    async json() {
      return JSON.parse(text);
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

const CREDS = { todoistApi: { apiKey: "test-api-key-123" } };

function installFetch(
  responses?: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>>,
) {
  responseQueue = responses
    ? Array.isArray(responses)
      ? [...responses]
      : [responses]
    : [mockResponse({})];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const next = responseQueue.shift() ?? mockResponse({});
      return next;
    }),
  );
}

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
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
    typeVersion: 1,
    parameters,
    credentials: Object.fromEntries(
      Object.entries(creds).map(([k]) => [k, { name: k }]),
    ),
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

describe("batch-queue todoistTool — n8n-nodes-base.todoistTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc!.displayName).toBe("Todoist Tool");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.todoistTool")).toBe(canonical);
  });

  it("create task — posts to Todoist API", async () => {
    installFetch(
      mockResponse({
        id: "task123",
        content: "Buy groceries",
        description: "Milk, eggs, bread",
        priority: 2,
        due: {
          string: "today",
          date: "2026-08-03",
          is_recurring: false,
          lang: "en",
        },
        is_completed: false,
        labels: [],
        project_id: "proj1",
        comment_count: 0,
        url: "https://todoist.com/showTask?id=task123",
      }),
    );

    const out = await run({
      resource: "task",
      operation: "create",
      content: "Buy groceries",
      description: "Milk, eggs, bread",
      priority: 2,
      due_string: "today",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.todoist.com/rest/v2/tasks");
    const body = JSON.parse(calls[0].body!);
    expect(body.content).toBe("Buy groceries");
    expect(body.description).toBe("Milk, eggs, bread");
    expect(body.priority).toBe(2);
    expect(body.due_string).toBe("today");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("task123");
    expect(out[0][0].json.content).toBe("Buy groceries");
  });

  it("get task by ID", async () => {
    installFetch(
      mockResponse({
        id: "abc123",
        content: "Buy groceries",
        is_completed: false,
        priority: 1,
      }),
    );

    const out = await run(
      {
        resource: "task",
        operation: "get",
        taskId: "={{ $json.taskId }}",
      },
      [{ json: { taskId: "abc123" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/tasks/abc123");
    expect(out[0][0].json.id).toBe("abc123");
    expect(out[0][0].json.content).toBe("Buy groceries");
  });

  it("close a task", async () => {
    installFetch(mockResponse(null, { status: 204 }));

    const out = await run(
      {
        resource: "task",
        operation: "close",
        taskId: "={{ $json.taskId }}",
      },
      [{ json: { taskId: "abc123" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/tasks/abc123/close");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("getAll tasks in a project", async () => {
    installFetch(
      mockResponse([
        {
          id: "task-1",
          content: "Buy groceries",
          is_completed: false,
        },
        {
          id: "task-2",
          content: "Submit report",
          is_completed: true,
        },
      ]),
    );

    const out = await run({
      resource: "task",
      operation: "getAll",
      projectId: "proj456",
      returnAll: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("project_id=proj456");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe("task-1");
    expect(out[0][1].json.id).toBe("task-2");
  });

  it("update a task", async () => {
    installFetch(mockResponse(null, { status: 204 }));

    const out = await run(
      {
        resource: "task",
        operation: "update",
        taskId: "={{ $json.taskId }}",
        content: "Updated content",
      },
      [{ json: { taskId: "abc123" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/tasks/abc123");
    const body = JSON.parse(calls[0].body!);
    expect(body.content).toBe("Updated content");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("move a task to another project", async () => {
    installFetch(mockResponse(null, { status: 204 }));

    const out = await run(
      {
        resource: "task",
        operation: "move",
        taskId: "={{ $json.taskId }}",
        projectId: "proj789",
      },
      [{ json: { taskId: "abc123" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/tasks/move");
    const body = JSON.parse(calls[0].body!);
    expect(body.id).toBe("abc123");
    expect(body.project_id).toBe("proj789");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("reopen a task", async () => {
    installFetch(mockResponse(null, { status: 204 }));

    const out = await run(
      {
        resource: "task",
        operation: "reopen",
        taskId: "abc123",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/tasks/abc123/reopen");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("delete a task", async () => {
    installFetch(mockResponse(null, { status: 204 }));

    const out = await run(
      {
        resource: "task",
        operation: "delete",
        taskId: "abc123",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/tasks/abc123");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("continueOnFail yields error item", async () => {
    installFetch(
      mockResponse({ message: "Task not found" }, { status: 404 }),
    );

    const out = await run(
      { resource: "task", operation: "close", taskId: "bad" },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/Task not found/);
  });

  it("fails when taskId is missing for get", async () => {
    await expect(
      run({ resource: "task", operation: "get" }, [{}]),
    ).rejects.toThrow(/taskId/);
  });

  it("fails when credential is missing", async () => {
    await expect(
      run({ resource: "task", operation: "get", taskId: "1" }, [{}], {
        credentials: {},
      }),
    ).rejects.toThrow(/API token/);
  });
});

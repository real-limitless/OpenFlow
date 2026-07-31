import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleTasks";
const CREDS = { googleTasksOAuth2Api: { accessToken: "tok_tasks" } };

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() {
      return text ? JSON.parse(text) : {};
    },
    async text() {
      return text;
    },
  };
}

type Handler = (url: string, method: string, body?: unknown) => ReturnType<typeof mockResponse>;
let handler: Handler;
let lastBody: unknown;
let lastUrl: string;
let lastMethod: string;

function installFetch(h: Handler) {
  handler = h;
  lastBody = undefined;
  lastUrl = "";
  lastMethod = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      lastBody = body;
      lastUrl = String(url);
      lastMethod = init?.method ?? "GET";
      return handler(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleTasksOAuth2Api: { name: "googleTasksOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleTasks executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("create a task", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/lists/tasklist-1/tasks")) {
        return mockResponse({
          id: "task-1",
          title: "Buy groceries",
          notes: "Milk, eggs, bread",
          status: "needsAction",
          due: "2025-12-31T00:00:00.000Z",
          kind: "tasks#task",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "task",
      operation: "create",
      task: "tasklist-1",
      title: "Buy groceries",
      additionalFields: {
        notes: "Milk, eggs, bread",
        dueDate: "2025-12-31T00:00:00Z",
      },
    });

    expect(out[0][0].json).toMatchObject({
      title: "Buy groceries",
      notes: "Milk, eggs, bread",
      status: "needsAction",
      kind: "tasks#task",
    });
    expect((out[0][0].json as Record<string, unknown>).id).toBeTypeOf("string");
    expect(lastMethod).toBe("POST");
    expect(lastBody).toMatchObject({
      title: "Buy groceries",
      notes: "Milk, eggs, bread",
      due: "2025-12-31T00:00:00Z",
    });
  });

  it("get a task by ID", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/tasks/existing-task-id")) {
        return mockResponse({
          id: "existing-task-id",
          title: "Buy groceries",
          notes: "Milk, eggs, bread",
          status: "needsAction",
          kind: "tasks#task",
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "task",
        operation: "get",
        task: "tasklist-1",
        taskId: "={{ $json.taskId }}",
      },
      [{ taskId: "existing-task-id" }],
    );

    expect(out[0][0].json).toMatchObject({
      id: "existing-task-id",
      kind: "tasks#task",
    });
    expect(lastMethod).toBe("GET");
    expect(lastUrl).toContain("existing-task-id");
  });

  it("get all tasks with limit", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/lists/tasklist-1/tasks")) {
        return mockResponse({
          items: Array.from({ length: 5 }, (_, i) => ({
            id: `t${i}`,
            title: `Task ${i}`,
            status: i % 2 === 0 ? "needsAction" : "completed",
            kind: "tasks#task",
          })),
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "task",
      operation: "getAll",
      task: "tasklist-1",
      returnAll: false,
      limit: 5,
    });

    expect(out[0].length).toBe(5);
    for (const item of out[0]) {
      expect((item.json as Record<string, unknown>).kind).toBe("tasks#task");
    }
    expect(lastUrl).toContain("maxResults=5");
  });

  it("update a task", async () => {
    installFetch((url, method) => {
      if (method === "PUT" && url.includes("/tasks/task-42")) {
        return mockResponse({
          id: "task-42",
          title: "Updated title",
          status: "completed",
          kind: "tasks#task",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "task",
      operation: "update",
      task: "tasklist-1",
      taskId: "task-42",
      updateFields: {
        title: "Updated title",
        status: "completed",
      },
    });

    expect(out[0][0].json).toMatchObject({
      title: "Updated title",
      status: "completed",
    });
    expect(lastMethod).toBe("PUT");
    expect(lastBody).toMatchObject({
      title: "Updated title",
      status: "completed",
    });
  });

  it("delete a task", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("/tasks/task-42")) {
        return mockResponse(null, 204);
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "task",
      operation: "delete",
      task: "tasklist-1",
      taskId: "task-42",
    });

    expect(out[0][0].json).toEqual({ success: true });
    expect(lastMethod).toBe("DELETE");
    expect(lastUrl).toContain("/tasks/task-42");
  });

  it("continueOnFail returns error json on 404", async () => {
    installFetch(() => mockResponse({ error: { message: "Not Found" } }, 404));
    const out = await run(
      {
        resource: "task",
        operation: "get",
        task: "tasklist-1",
        taskId: "missing",
      },
      [{}],
      { continueOnFail: true },
    );
    expect((out[0][0].json as Record<string, unknown>).error).toContain("Not Found");
  });

  it("throws on missing task list", async () => {
    await expect(
      run({
        resource: "task",
        operation: "getAll",
        task: "",
      }),
    ).rejects.toThrow("Task List is required");
  });
});
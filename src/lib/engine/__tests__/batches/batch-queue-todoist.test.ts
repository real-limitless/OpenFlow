import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.todoist";
const CREDS = { todoistApi: { apiKey: "test_token_123" } };

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 204 ? "No Content" : "OK",
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
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
) {
  const creds: Record<string, Record<string, unknown>> = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
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
    getCredential: async (name: string) => creds[name] ?? null,
  });
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue todoist — n8n-nodes-base.todoist", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Todoist");
  });

  it("create a task", async () => {
    installFetch((url, method, body) => {
      expect(method).toBe("POST");
      expect(url).toBe("https://api.todoist.com/rest/v2/tasks");
      expect(body).toMatchObject({ content: "Buy groceries", priority: 2 });
      return mockResponse({
        id: "2995104339",
        content: "Buy groceries",
        priority: 2,
        isCompleted: false,
      });
    });

    const out = await run(
      {
        resource: "task",
        operation: "create",
        content: "={{ $json.content }}",
        priority: 2,
      },
      [{ content: "Buy groceries" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("2995104339");
    expect(out[0][0].json.content).toBe("Buy groceries");
    expect(out[0][0].json.isCompleted).toBe(false);
  });

  it("close a task (pass-through)", async () => {
    installFetch((url, method) => {
      expect(method).toBe("POST");
      expect(url).toBe("https://api.todoist.com/rest/v2/tasks/2995104339/close");
      return mockResponse(null, 204);
    });

    const out = await run(
      {
        resource: "task",
        operation: "close",
        taskId: "={{ $json.taskId }}",
      },
      [{ taskId: "2995104339", source: "workflow" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ taskId: "2995104339", source: "workflow" });
  });

  it("get a task", async () => {
    installFetch((url, method) => {
      expect(method).toBe("GET");
      expect(url).toBe("https://api.todoist.com/rest/v2/tasks/2995104339");
      return mockResponse({
        id: "2995104339",
        content: "Buy groceries",
        isCompleted: false,
      });
    });

    const out = await run(
      {
        resource: "task",
        operation: "get",
        taskId: "={{ $json.taskId }}",
      },
      [{ taskId: "2995104339" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("2995104339");
    expect(out[0][0].json.content).toBe("Buy groceries");
    expect(out[0][0].json.isCompleted).toBe(false);
  });

  it("get all tasks (filtered)", async () => {
    installFetch((url, method) => {
      expect(method).toBe("GET");
      expect(url).toContain("project_id=2203306141");
      expect(url).toContain("filter=today");
      return mockResponse([
        { id: "2995104339", content: "Buy milk" },
        { id: "2995104340", content: "Walk dog" },
      ]);
    });

    const out = await run(
      {
        resource: "task",
        operation: "getAll",
        projectId: "={{ $json.projectId }}",
        filter: "today",
      },
      [{ projectId: "2203306141" }],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe("2995104339");
    expect(out[0][0].json.content).toBe("Buy milk");
    expect(out[0][1].json.id).toBe("2995104340");
    expect(out[0][1].json.content).toBe("Walk dog");
  });

  it("delete a task (pass-through)", async () => {
    installFetch((url, method) => {
      expect(method).toBe("DELETE");
      expect(url).toBe("https://api.todoist.com/rest/v2/tasks/2995104339");
      return mockResponse(null, 204);
    });

    const out = await run(
      {
        resource: "task",
        operation: "delete",
        taskId: "={{ $json.taskId }}",
      },
      [{ taskId: "2995104339" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ taskId: "2995104339" });
  });

  it("reopen a task (pass-through)", async () => {
    installFetch((url, method) => {
      expect(method).toBe("POST");
      expect(url).toBe("https://api.todoist.com/rest/v2/tasks/2995104339/reopen");
      return mockResponse(null, 204);
    });

    const out = await run(
      {
        resource: "task",
        operation: "reopen",
        taskId: "2995104339",
      },
      [{ taskId: "2995104339" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.taskId).toBe("2995104339");
  });

  it("update a task", async () => {
    installFetch((url, method, body) => {
      expect(method).toBe("POST");
      expect(url).toBe("https://api.todoist.com/rest/v2/tasks/2995104339");
      expect(body).toMatchObject({ content: "Updated task", priority: 3 });
      return mockResponse({
        id: "2995104339",
        content: "Updated task",
        priority: 3,
      });
    });

    const out = await run(
      {
        resource: "task",
        operation: "update",
        taskId: "2995104339",
        content: "Updated task",
        priority: 3,
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.content).toBe("Updated task");
    expect(out[0][0].json.priority).toBe(3);
  });

  it("fails when todoistApi credential is missing", async () => {
    await expect(
      run(
        {
          resource: "task",
          operation: "create",
          content: "Test",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/Todoist: credential is not configured/);
  });

  it("continueOnFail yields error item", async () => {
    installFetch(() => mockResponse({ message: "Validation error" }, 400));

    const out = await run(
      {
        resource: "task",
        operation: "get",
        taskId: "nonexistent",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/Validation error/);
  });
});
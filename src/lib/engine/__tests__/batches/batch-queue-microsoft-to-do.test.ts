import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftToDo";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get() { return null; },
      entries() { return new Map().entries(); },
    },
    async json() { return text ? JSON.parse(text) : null; },
    async text() { return text; },
  };
}

interface FetchCall { url: string; method: string; body: string | undefined }

let calls: FetchCall[];
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback = mockResponse({ ok: true }),
) {
  routeMap = routes;
  defaultResponse = fallback;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        url: String(url),
        method,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const key = `${method} ${url}`;
      return routeMap[key] ?? defaultResponse;
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

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    typeVersion: 1,
    parameters,
    credentials: { microsoftToDoOAuth2Api: { name: "microsoftToDoOAuth2Api" } },
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { microsoftToDoOAuth2Api: { accessToken: "fake-token-123" } };

beforeEach(() => {
  installFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue microsoftToDo — n8n-nodes-base.microsoftToDo", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Microsoft To Do");
  });

  it("creates a task list", async () => {
    const listId = "AAMkADkz...";
    installFetch({
      "POST https://graph.microsoft.com/v1.0/me/todo/lists": mockResponse({
        id: listId,
        displayName: "Errands",
        wellknownListName: "none",
      }),
    });
    const out = await run({
      resource: "list",
      operation: "create",
      displayName: "Errands",
    }, [{ json: { listName: "Errands" } }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/me/todo/lists");
    const body = JSON.parse(calls[0].body as string);
    expect(body.displayName).toBe("Errands");
    expect(out[0][0].json).toMatchObject({ id: listId, displayName: "Errands" });
  });

  it("gets all tasks in a list", async () => {
    installFetch({
      "GET https://graph.microsoft.com/v1.0/me/todo/lists/AAMkADkz.../tasks": mockResponse({
        value: [
          { id: "t1", title: "Task 1", importance: "high", status: "notStarted" },
          { id: "t2", title: "Task 2", importance: "normal", status: "inProgress" },
        ],
      }),
    });
    const out = await run({
      resource: "task",
      operation: "getAll",
      listId: "AAMkADkz...",
      returnAll: true,
    }, [{ json: { listId: "AAMkADkz..." } }]);
    expect(calls).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "t1", title: "Task 1" });
    expect(out[0][1].json).toMatchObject({ id: "t2", title: "Task 2" });
  });

  it("creates a task with due date", async () => {
    installFetch({
      "POST https://graph.microsoft.com/v1.0/me/todo/lists/AAMkADkz.../tasks": mockResponse({
        id: "t-new",
        title: "Buy groceries",
        dueDateTime: "2026-08-15T18:00:00Z",
        importance: "high",
        status: "notStarted",
        createdDateTime: "2026-07-31T12:00:00Z",
      }),
    });
    const out = await run({
      resource: "task",
      operation: "create",
      listId: "AAMkADkz...",
      title: "Buy groceries",
      additionalFields: {
        dueDateTime: "2026-08-15T18:00:00Z",
        importance: "high",
      },
    }, [{ json: { listId: "AAMkADkz...", taskTitle: "Buy groceries" } }]);
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body as string);
    expect(body.title).toBe("Buy groceries");
    expect(body.dueDateTime).toBe("2026-08-15T18:00:00Z");
    expect(body.importance).toBe("high");
    expect(out[0][0].json).toMatchObject({ id: "t-new", title: "Buy groceries" });
  });

  it("deletes a task with continueOnFail", async () => {
    installFetch({
      "DELETE https://graph.microsoft.com/v1.0/me/todo/lists/AAMkADkz.../tasks/NONEXISTENT": {
        status: 404,
        statusText: "Not Found",
        ok: false,
        headers: { get() { return "application/json"; }, entries() { return new Map().entries(); } },
        async json() { return { message: "Resource not found" }; },
        async text() { return '{"message":"Resource not found"}'; },
      },
    });
    const out = await run({
      resource: "task",
      operation: "delete",
      listId: "AAMkADkz...",
      taskId: "NONEXISTENT",
    }, [{ json: { listId: "AAMkADkz...", taskId: "NONEXISTENT" } }], { continueOnFail: true });
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toHaveProperty("message");
  });

  it("updates a task status", async () => {
    installFetch({
      "PATCH https://graph.microsoft.com/v1.0/me/todo/lists/AAMkADkz.../tasks/ABC123": mockResponse(null, 204),
      "GET https://graph.microsoft.com/v1.0/me/todo/lists/AAMkADkz.../tasks/ABC123": mockResponse({
        id: "ABC123",
        title: "My Task",
        status: "completed",
        completedDateTime: "2026-07-31T12:00:00Z",
      }),
    });
    const out = await run({
      resource: "task",
      operation: "update",
      listId: "AAMkADkz...",
      taskId: "ABC123",
      additionalFields: { status: "completed" },
    }, [{ json: { listId: "AAMkADkz...", taskId: "ABC123" } }]);
    expect(calls).toHaveLength(2);
    const patchBody = JSON.parse(calls[0].body as string);
    expect(patchBody.status).toBe("completed");
    expect(out[0][0].json).toMatchObject({ id: "ABC123", status: "completed" });
  });

  it("gets all lists", async () => {
    installFetch({
      "GET https://graph.microsoft.com/v1.0/me/todo/lists": mockResponse({
        value: [
          { id: "l1", displayName: "Tasks", wellknownListName: "defaultList" },
          { id: "l2", displayName: "Shopping", wellknownListName: "none" },
        ],
      }),
    });
    const out = await run({ resource: "list", operation: "getAll", returnAll: true });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "l1", displayName: "Tasks" });
  });

  it("deletes a list", async () => {
    installFetch({
      "DELETE https://graph.microsoft.com/v1.0/me/todo/lists/l-to-delete": mockResponse(null, 204),
    });
    const out = await run({ resource: "list", operation: "delete", listId: "l-to-delete" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(out[0][0].json).toEqual({});
  });
});
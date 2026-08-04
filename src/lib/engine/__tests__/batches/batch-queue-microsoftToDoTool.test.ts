import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftToDoTool";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: new Map(),
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

describe("batch-queue microsoftToDoTool — n8n-nodes-base.microsoftToDoTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Microsoft To Do (AI Tool)");
  });

  it("creates a task list via AI tool", async () => {
    const listId = "AAMkADkz...";
    installFetch({
      "POST https://graph.microsoft.com/v1.0/me/todo/lists": mockResponse({
        id: listId,
        displayName: "Shopping",
        wellknownListName: "none",
      }),
    });
    const out = await run({
      resource: "list",
      operation: "create",
      displayName: "{{ $json.listName }}",
    }, [{ json: { listName: "Shopping" } }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/me/todo/lists");
    const body = JSON.parse(calls[0].body as string);
    expect(body.displayName).toBe("Shopping");
    expect(out[0][0].json).toMatchObject({ id: listId, displayName: "Shopping" });
  });

  it("creates a task with due date", async () => {
    installFetch({
      "POST https://graph.microsoft.com/v1.0/me/todo/lists/AAMkADkz.../tasks": mockResponse({
        id: "t-new",
        title: "Buy milk",
        dueDateTime: "2026-08-15T18:00:00Z",
        importance: "high",
        status: "notStarted",
        createdDateTime: "2026-07-31T12:00:00Z",
      }),
    });
    const out = await run({
      resource: "task",
      operation: "create",
      listId: "{{ $json.listId }}",
      title: "{{ $json.title }}",
      dueDateTime: "2026-08-15T18:00:00Z",
      importance: "high",
    }, [{ json: { listId: "AAMkADkz...", title: "Buy milk" } }]);
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body as string);
    expect(body.title).toBe("Buy milk");
    expect(body.dueDateTime).toBe("2026-08-15T18:00:00Z");
    expect(body.importance).toBe("high");
    expect(out[0][0].json).toMatchObject({ id: "t-new", title: "Buy milk" });
  });

  it("gets all tasks in a list", async () => {
    installFetch({
      "GET https://graph.microsoft.com/v1.0/me/todo/lists/AAMkADkz.../tasks": mockResponse({
        value: [
          { id: "t1", title: "Task 1", status: "notStarted" },
          { id: "t2", title: "Task 2", status: "inProgress" },
        ],
      }),
    });
    const out = await run({
      resource: "task",
      operation: "getAll",
      listId: "{{ $json.listId }}",
      returnAll: true,
    }, [{ json: { listId: "AAMkADkz..." } }]);
    expect(calls).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "t1", title: "Task 1" });
    expect(out[0][1].json).toMatchObject({ id: "t2", title: "Task 2" });
  });

  it("does not throw when $fromAI() is present", async () => {
    const out = await run({
      resource: "task",
      operation: "create",
      listId: "= $fromAI('listId')",
      title: "= $fromAI('title')",
      importance: "normal",
    });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });

  it("delete with continueOnFail yields error item", async () => {
    installFetch({
      "DELETE https://graph.microsoft.com/v1.0/me/todo/lists/AAMkADkz...DELETED": mockResponse(
        { message: "Resource not found" },
        404,
      ),
    });
    const out = await run({
      resource: "list",
      operation: "delete",
      listId: "{{ $json.listId }}",
    }, [{ json: { listId: "AAMkADkz...DELETED" } }], { continueOnFail: true });
    expect(out[0][0].json).toHaveProperty("error");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.monicaCrmTool";

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
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
  cred?: Record<string, unknown> | null,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf", name: "Test", active: false,
      nodes: [node], connections: {}, settings: {},
    },
    getNodeInputItems: () =>
      items.map((json) => ({ json, pairedItem: { item: 0, input: 0 } })),
    continueOnFail,
    getCredential: async () => cred !== undefined ? cred : { apiToken: "test_monica_token" },
  });
}

describe("monicaCrmTool", () => {
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
    expect(desc).not.toBeNull();
    expect(desc!.name).toBe(TYPE);
    expect(desc!.category).toBe("Communication");
  });

  it("creates a contact", async () => {
    installFetch(
      mockResponse({
        data: { id: 42, first_name: "Alice", last_name: "Johnson", gender_id: 1 },
      }),
    );

    const node = {
      id: "1",
      name: "Monica CRM Tool",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "contact",
        operation: "create",
        firstName: "Alice",
        lastName: "Johnson",
        genderId: 1,
      },
    };

    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    expect(output[0].json.id).toBe(42);
    expect(output[0].json.first_name).toBe("Alice");
    expect(output[0].json.last_name).toBe("Johnson");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/api/contacts");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.first_name).toBe("Alice");
    expect(body.last_name).toBe("Johnson");
    expect(body.gender_id).toBe(1);
  });

  it("creates a note via simpleBody", async () => {
    installFetch(
      mockResponse({
        data: { id: 77, body: "Follow up on project proposal", contact: { id: 42 } },
      }),
    );

    const node = {
      id: "1",
      name: "Monica CRM Tool",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "note",
        operation: "create",
        contactId: "42",
        simpleBody: "Follow up on project proposal",
      },
    };

    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    expect(output[0].json.id).toBe(77);
    expect(output[0].json.body).toBe("Follow up on project proposal");
    expect(output[0].json.contact.id).toBe(42);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/api/notes");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.body).toBe("Follow up on project proposal");
  });

  it("creates a note via body parameter", async () => {
    installFetch(
      mockResponse({
        data: { id: 77, body: "Note body text", contact: { id: 42 } },
      }),
    );

    const node = {
      id: "1",
      name: "Monica CRM Tool",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "note",
        operation: "create",
        contactId: "42",
        body: "Note body text",
      },
    };

    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output[0].json.body).toBe("Note body text");

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.body).toBe("Note body text");
  });

  it("retrieves all activities with pagination", async () => {
    installFetch(
      mockResponse({
        data: [{ id: 1, summary: "Met for coffee", activity_type_id: 1, date: "2024-01-15" }],
        links: { first: "...", last: "...", prev: null, next: "..." },
        meta: { current_page: 1, per_page: 10, total: 5 },
      }),
    );

    const node = {
      id: "1",
      name: "Monica CRM Tool",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "activity",
        operation: "getAll",
        limit: 10,
        returnAll: false,
      },
    };

    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    // Non-returnAll returns the full envelope per spec
    expect(output).toHaveLength(1);
    expect(Array.isArray(output[0].json.data)).toBe(true);
    expect(output[0].json.data[0].summary).toBe("Met for coffee");
    expect(output[0].json.data[0].activity_type_id).toBe(1);
    expect(output[0].json.meta).toBeDefined();
    expect(output[0].json.links).toBeDefined();

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/api/activities");
  });

  it("normalizes Title-Case Retrieve all → getAll", async () => {
    installFetch(
      mockResponse({
        data: [],
        links: {},
        meta: { current_page: 1, per_page: 10, total: 0 },
      }),
    );
    const node = {
      id: "1", name: "Monica CRM Tool", type: TYPE, typeVersion: 1, position: [0, 0],
      parameters: { resource: "Contact", operation: "Retrieve all", returnAll: false },
    };
    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    await executor(ctx, node);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
  });

  it("normalizes Title-Case Retrieve (singular) → get-by-id", async () => {
    installFetch(mockResponse({ data: { id: 99, first_name: "Charlie" } }));
    const node = {
      id: "1", name: "Monica CRM Tool", type: TYPE, typeVersion: 1, position: [0, 0],
      parameters: { resource: "Contact", operation: "Retrieve", id: "99" },
    };
    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);
    expect(output[0].json.id).toBe(99);
    expect(output[0].json.first_name).toBe("Charlie");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/contacts/99");
  });

  it("normalizes Title-Case Contact/Create", async () => {
    installFetch(mockResponse({ data: { id: 10, first_name: "Diana", last_name: "Prince" } }));
    const node = {
      id: "1", name: "Monica CRM Tool", type: TYPE, typeVersion: 1, position: [0, 0],
      parameters: { resource: "Contact", operation: "Create", firstName: "Diana", lastName: "Prince" },
    };
    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);
    expect(output[0].json.first_name).toBe("Diana");
    expect(output[0].json.last_name).toBe("Prince");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.first_name).toBe("Diana");
    expect(body.last_name).toBe("Prince");
  });

  it("updates a contact by id", async () => {
    installFetch(mockResponse({ data: { id: 5, first_name: "Bob", last_name: "Updated" } }));
    const node = {
      id: "1", name: "Monica CRM Tool", type: TYPE, typeVersion: 1, position: [0, 0],
      parameters: { resource: "contact", operation: "update", id: "5", lastName: "Updated" },
    };
    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);
    expect(output[0].json.last_name).toBe("Updated");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toContain("/contacts/5");
  });

  it("accepts tagsToAdd as comma-separated string", async () => {
    installFetch(mockResponse({ data: { success: true } }));
    const node = {
      id: "1", name: "Monica CRM Tool", type: TYPE, typeVersion: 1, position: [0, 0],
      parameters: { resource: "contactTag", operation: "add", contactId: "42", tagsToAdd: "1,2,3" },
    };
    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    await executor(ctx, node);
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.tags).toEqual([1, 2, 3]);
  });

  it("creates a task with title and completed", async () => {
    installFetch(mockResponse({ data: { id: 100, title: "Test Task", completed: true } }));
    const node = {
      id: "1", name: "Monica CRM Tool", type: TYPE, typeVersion: 1, position: [0, 0],
      parameters: { resource: "task", operation: "create", contactId: "10", title: "Test Task", completed: true },
    };
    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);
    expect(output[0].json.title).toBe("Test Task");
    expect(output[0].json.completed).toBe(true);
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.title).toBe("Test Task");
    expect(body.completed).toBe(true);
  });

  it("creates a tag with name", async () => {
    installFetch(mockResponse({ data: { id: 200, name: "VIP" } }));
    const node = {
      id: "1", name: "Monica CRM Tool", type: TYPE, typeVersion: 1, position: [0, 0],
      parameters: { resource: "tag", operation: "create", name: "VIP" },
    };
    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);
    expect(output[0].json.name).toBe("VIP");
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.name).toBe("VIP");
  });

  it("adds tags to a contact", async () => {
    installFetch(
      mockResponse({ data: { success: true } }),
    );

    const node = {
      id: "1",
      name: "Monica CRM Tool",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "contactTag",
        operation: "add",
        contactId: "42",
        tagsToAdd: [1, 2],
      },
    };

    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/contacts/42/tags");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.tags).toEqual([1, 2]);
  });

  it("removes tags from a contact", async () => {
    installFetch([
      mockResponse({}),
      mockResponse({}),
    ]);

    const node = {
      id: "1",
      name: "Monica CRM Tool",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "contactTag",
        operation: "remove",
        contactId: "42",
        tagsToRemove: [1, 2],
      },
    };

    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    await executor(ctx, node);

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/contacts/42/tags/1");
    expect(calls[1].url).toContain("/contacts/42/tags/2");
    expect(calls[0].method).toBe("DELETE");
    expect(calls[1].method).toBe("DELETE");
  });

  it("gets an entity by id", async () => {
    installFetch(
      mockResponse({ data: { id: 5, first_name: "Bob", last_name: "Smith" } }),
    );

    const node = {
      id: "1",
      name: "Monica CRM Tool",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "contact",
        operation: "get",
        id: "5",
      },
    };

    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    expect(output[0].json.id).toBe(5);
    expect(output[0].json.first_name).toBe("Bob");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/api/contacts/5");
  });

  it("deletes an entity by id", async () => {
    installFetch(mockResponse({}));

    const node = {
      id: "1",
      name: "Monica CRM Tool",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "activity",
        operation: "delete",
        id: "10",
      },
    };

    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/api/activities/10");
  });

  it("uses self-hosted credential domain as base URL", async () => {
    installFetch(
      mockResponse({ data: { id: 1, first_name: "Self", last_name: "Hosted" } }),
    );

    const node = {
      id: "1",
      name: "Monica CRM Tool",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "contact",
        operation: "get",
        id: "1",
      },
    };

    const ctx = makeCtx([{}], node, false, {
      apiToken: "self_hosted_token",
      environment: "selfHosted",
      domain: "https://monica.example.com",
    });
    const executor = getExecutor(TYPE)!;
    await executor(ctx, node);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/^https:\/\/monica\.example\.com\/api\/contacts\/1$/);
  });

  it("throws on missing credential", async () => {
    const node = {
      id: "1",
      name: "Monica CRM Tool",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "contact",
        operation: "create",
        firstName: "Alice",
      },
    };

    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {}, pairedItem: { item: 0, input: 0 } }],
      continueOnFail: false,
      getCredential: async () => null,
    });

    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/credential/i);
  });
});

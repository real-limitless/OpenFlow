import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.highLevel";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
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
      const next = responseQueue.shift() ?? mockResponse({});
      return next;
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
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

const CREDS = { highLevelOAuth2Api: { accessToken: "test_token" } };
const BASE_URL = "https://rest.gohighlevel.com/v1";

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
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => { installFetch(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue highLevel — n8n-nodes-base.highLevel", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("HighLevel");
  });

  it("upsert a contact with email and fields", async () => {
    installFetch(
      mockResponse({ contact: { id: "contact123", email: "test@example.com", name: "Alice" } }),
    );

    const out = await run(
      {
        resource: "contact",
        operation: "upsert",
        email: "test@example.com",
        contactFields: JSON.stringify({ name: "Alice", phone: "555-0100" }),
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE_URL}/contacts/upsert`);
    expect(calls[0].headers.Authorization).toBe("Bearer test_token");
    const body = JSON.parse(calls[0].body!);
    expect(body.email).toBe("test@example.com");
    expect(body.name).toBe("Alice");
    expect(body.phone).toBe("555-0100");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ contact: { id: "contact123" }, status: "created" });
  });

  it("get one contact by ID", async () => {
    installFetch(
      mockResponse({ contact: { id: "contact456", email: "bob@test.com" } }),
    );

    const out = await run(
      { resource: "contact", operation: "get", contactId: "contact456" },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE_URL}/contacts/contact456`);
    expect(out[0][0].json).toMatchObject({ contact: { id: "contact456" } });
  });

  it("getAll contacts with limit", async () => {
    installFetch(
      mockResponse({ contacts: [{ id: "c1" }, { id: "c2" }], meta: { total: 2 } }),
    );

    const out = await run(
      { resource: "contact", operation: "getAll", limit: 10, queryOptions: JSON.stringify({ query: "test" }) },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("limit=10");
    expect(calls[0].url).toContain("query=test");
    expect(out[0][0].json).toMatchObject({ contacts: [{ id: "c1" }, { id: "c2" }], meta: { total: 2 } });
  });

  it("delete a contact", async () => {
    installFetch(mockResponse({}));

    const out = await run(
      { resource: "contact", operation: "delete", contactId: "contact789" },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE_URL}/contacts/contact789`);
    expect(out[0][0].json).toMatchObject({ contactId: "contact789", deleted: true });
  });

  it("update a contact", async () => {
    installFetch(
      mockResponse({ contact: { id: "contact123", name: "Updated Name" } }),
    );

    const out = await run(
      {
        resource: "contact",
        operation: "update",
        contactId: "contact123",
        contactFields: JSON.stringify({ name: "Updated Name" }),
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(`${BASE_URL}/contacts/contact123`);
    const body = JSON.parse(calls[0].body!);
    expect(body.name).toBe("Updated Name");
    expect(out[0][0].json).toMatchObject({ contact: { id: "contact123" }, status: "updated" });
  });

  it("create an opportunity", async () => {
    installFetch(
      mockResponse({ opportunity: { id: "opp1", name: "Big Deal", status: "open" } }),
    );

    const out = await run(
      {
        resource: "opportunity",
        operation: "create",
        opportunityFields: JSON.stringify({ name: "Big Deal", status: "open" }),
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE_URL}/opportunities`);
    const body = JSON.parse(calls[0].body!);
    expect(body.name).toBe("Big Deal");
    expect(out[0][0].json).toMatchObject({ opportunity: { id: "opp1" }, status: "created" });
  });

  it("get all opportunities", async () => {
    installFetch(
      mockResponse({ opportunities: [{ id: "opp1" }, { id: "opp2" }], meta: { total: 2 } }),
    );

    const out = await run(
      { resource: "opportunity", operation: "getAll", limit: 50 },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("limit=50");
    expect(out[0][0].json).toMatchObject({ opportunities: [{ id: "opp1" }, { id: "opp2" }] });
  });

  it("create a task", async () => {
    installFetch(
      mockResponse({ task: { id: "task1", title: "Follow up", status: "pending" } }),
    );

    const out = await run(
      {
        resource: "task",
        operation: "create",
        taskFields: JSON.stringify({ title: "Follow up", status: "pending" }),
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE_URL}/tasks`);
    const body = JSON.parse(calls[0].body!);
    expect(body.title).toBe("Follow up");
    expect(out[0][0].json).toMatchObject({ task: { id: "task1" }, status: "created" });
  });

  it("update and delete a task", async () => {
    installFetch([
      mockResponse({ task: { id: "task1", title: "Updated", status: "completed" } }),
      mockResponse({}),
    ]);

    const out1 = await run(
      {
        resource: "task",
        operation: "update",
        taskId: "task1",
        taskFields: JSON.stringify({ title: "Updated", status: "completed" }),
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(`${BASE_URL}/tasks/task1`);
    expect(out1[0][0].json).toMatchObject({ task: { id: "task1" }, status: "updated" });

    const out2 = await run(
      { resource: "task", operation: "delete", taskId: "task1" },
      [{}],
    );

    expect(calls).toHaveLength(2);
    expect(calls[1].method).toBe("DELETE");
    expect(calls[1].url).toBe(`${BASE_URL}/tasks/task1`);
    expect(out2[0][0].json).toMatchObject({ taskId: "task1", deleted: true });
  });

  it("get free slots on calendar", async () => {
    installFetch(
      mockResponse({ slots: [{ start: "2026-08-01T09:00:00Z" }, { start: "2026-08-01T10:00:00Z" }] }),
    );

    const out = await run(
      {
        resource: "calendar",
        operation: "getFreeSlots",
        calendarId: "cal1",
        queryOptions: JSON.stringify({ startDate: "2026-08-01", endDate: "2026-08-01" }),
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/calendars/cal1/free-slots");
    expect(calls[0].url).toContain("startDate=2026-08-01");
    expect(out[0][0].json).toMatchObject({ slots: [{ start: "2026-08-01T09:00:00Z" }, { start: "2026-08-01T10:00:00Z" }] });
  });

  it("book an appointment on calendar", async () => {
    installFetch(
      mockResponse({ appointment: { id: "apt1", status: "booked", startTime: "2026-08-01T09:00:00Z" } }),
    );

    const out = await run(
      {
        resource: "calendar",
        operation: "bookAppointment",
        calendarId: "cal1",
        appointmentFields: JSON.stringify({ startTime: "2026-08-01T09:00:00Z", email: "client@test.com" }),
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/calendars/cal1/appointments");
    const body = JSON.parse(calls[0].body!);
    expect(body.startTime).toBe("2026-08-01T09:00:00Z");
    expect(out[0][0].json).toMatchObject({ appointment: { id: "apt1" }, status: "booked" });
  });

  it("invalid credentials throws actionable error", async () => {
    const badCreds = { highLevelOAuth2Api: { accessToken: "" } };
    await expect(
      run(
        { resource: "contact", operation: "get", contactId: "1" },
        [{}],
        { credentials: badCreds },
      ),
    ).rejects.toThrow(/No valid credential found/);
  });

  it("unsupported resource throws error", async () => {
    await expect(
      run({ resource: "invalid", operation: "get", contactId: "1" }, [{}]),
    ).rejects.toThrow(/unsupported resource/);
  });

  it("missing required contactId throws error", async () => {
    await expect(
      run({ resource: "contact", operation: "get" }, [{}]),
    ).rejects.toThrow(/contactId is required/);
  });

  it("API error with continueOnFail returns error item", async () => {
    installFetch(mockResponse({ message: "Not found" }, { status: 404 }));

    const out = await run(
      { resource: "contact", operation: "get", contactId: "nonexistent" },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ error: { message: "Not found", code: 404 } });
  });
});
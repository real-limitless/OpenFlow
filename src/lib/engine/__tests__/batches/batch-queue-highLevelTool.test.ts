import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.highLevelTool";

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
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
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
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({})) {
  nextResponse = response;
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
      return nextResponse;
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

const CREDS = { highLevelOAuth2Api: { accessToken: "test-oauth-token" } };

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

describe("batch-queue highLevelTool — n8n-nodes-base.highLevelTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("HighLevel (AI Tool)");
  });

  it("creates/upserts a contact", async () => {
    installFetch(
      mockResponse({
        contact: {
          id: "contact-123",
          email: "jane@example.com",
          firstName: "Jane",
          lastName: "Doe",
          phone: "+12025551234",
        },
      }),
    );
    const out = await run({
      resource: "contact",
      operation: "create",
      email: "jane@example.com",
      phone: "+12025551234",
      additionalFields: JSON.stringify({ firstName: "Jane", lastName: "Doe" }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/contacts/upsert");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.email).toBe("jane@example.com");
    expect(sentBody.phone).toBe("+12025551234");
    expect(out[0][0].json).toMatchObject({
      id: "contact-123",
      email: "jane@example.com",
      firstName: "Jane",
    });
  });

  it("gets free calendar slots", async () => {
    installFetch(
      mockResponse({
        slots: [
          { start: "2026-08-10T09:00:00Z", end: "2026-08-10T09:30:00Z" },
          { start: "2026-08-10T10:00:00Z", end: "2026-08-10T10:30:00Z" },
        ],
      }),
    );
    const out = await run({
      resource: "calendar",
      operation: "getFreeSlots",
      calendarId: "cal-1",
      startDate: "2026-08-10",
      endDate: "2026-08-10",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/calendars/cal-1/free-slots");
    expect(out[0][0].json).toMatchObject({
      slots: [
        { start: "2026-08-10T09:00:00Z", end: "2026-08-10T09:30:00Z" },
        { start: "2026-08-10T10:00:00Z", end: "2026-08-10T10:30:00Z" },
      ],
    });
  });

  it("books a calendar appointment", async () => {
    installFetch(
      mockResponse({
        appointment: {
          id: "apt-1",
          status: "booked",
          startTime: "2026-08-10T09:00:00Z",
          endTime: "2026-08-10T09:30:00Z",
        },
      }),
    );
    const out = await run({
      resource: "calendar",
      operation: "bookAppointment",
      calendarId: "cal-1",
      startTime: "2026-08-10T09:00:00Z",
      endTime: "2026-08-10T09:30:00Z",
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/calendars/cal-1/appointments");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.startTime).toBe("2026-08-10T09:00:00Z");
    expect(sentBody.endTime).toBe("2026-08-10T09:30:00Z");
    expect(out[0][0].json).toMatchObject({
      id: "apt-1",
      status: "booked",
      contactEmail: "jane@example.com",
    });
  });

  it("lists opportunities with pagination", async () => {
    installFetch(
      mockResponse({
        opportunities: [
          { id: "opp-1", name: "Deal A", status: "open", contactId: "c-1", monetaryValue: 5000 },
          { id: "opp-2", name: "Deal B", status: "won", contactId: "c-2", monetaryValue: 12000 },
        ],
      }),
    );
    const out = await run({
      resource: "opportunity",
      operation: "getAll",
      pipelineId: "pipe-1",
      returnAll: false,
      limit: 10,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/opportunities");
    expect(Array.isArray(out[0][0].json)).toBe(true);
    expect((out[0][0].json as Record<string, unknown>[])).toHaveLength(2);
  });

  it("creates and completes a task", async () => {
    installFetch(
      mockResponse({
        task: { id: "task-1", title: "Follow up on proposal", dueDate: "2026-08-15T00:00:00Z", status: "incompleted" },
      }),
    );
    const out = await run({
      resource: "task",
      operation: "create",
      contactId: "contact-1",
      title: "Follow up on proposal",
      dueDate: "2026-08-15T00:00:00Z",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/tasks");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.title).toBe("Follow up on proposal");
    expect(out[0][0].json).toMatchObject({
      id: "task-1",
      title: "Follow up on proposal",
      status: "incompleted",
    });

    installFetch(
      mockResponse({
        task: { id: "task-1", title: "Follow up on proposal", status: "completed" },
      }),
    );
    const out2 = await run({
      resource: "task",
      operation: "update",
      contactId: "contact-1",
      taskId: "task-1",
      status: "completed",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(out2[0][0].json).toMatchObject({ status: "completed" });
  });

  it("errors on invalid contact ID with continueOnFail", async () => {
    installFetch(
      mockResponse(
        { message: "Contact not found", error: "Not Found" },
        { status: 404 },
      ),
    );
    const out = await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "nonexistent-id-12345",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0][0].json).toMatchObject({
      error: expect.stringContaining("Contact not found"),
    });
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "contact", operation: "get", contactId: "c-1" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/No valid credential found/);
  });
});

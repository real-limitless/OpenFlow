import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googleCalendarTool";

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

const CREDS = { googleCalendarOAuth2Api: { accessToken: "ya29.cal_token" } };

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({})) {
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

describe("batch-queue googleCalendarTool — n8n-nodes-base.googleCalendarTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Google Calendar (AI Tool)");
  });

  // Acceptance: Check calendar availability (test from spec)
  it("checks calendar availability", async () => {
    const freeBusyResponse = {
      kind: "calendar#freeBusy",
      timeMin: "2026-08-01T00:00:00Z",
      timeMax: "2026-08-01T02:00:00Z",
      calendars: {
        primary: {
          busy: [],
        },
      },
    };
    installFetch(mockResponse(freeBusyResponse));
    const out = await run({
      resource: "calendar",
      operation: "availability",
      calendar: { mode: "id", value: "primary" },
      startTime: "2026-08-01T00:00:00Z",
      endTime: "2026-08-01T02:00:00Z",
      options: { outputFormat: "availability" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/freeBusy");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.items).toEqual([{ id: "primary" }]);
    expect(out[0][0].json).toEqual({ available: true });
  });

  // Acceptance: Check availability with busy slots
  it("returns booked slots when busy", async () => {
    const freeBusyResponse = {
      kind: "calendar#freeBusy",
      timeMin: "2026-08-01T00:00:00Z",
      timeMax: "2026-08-01T02:00:00Z",
      calendars: {
        primary: {
          busy: [
            { start: "2026-08-01T01:00:00Z", end: "2026-08-01T01:30:00Z" },
          ],
        },
      },
    };
    installFetch(mockResponse(freeBusyResponse));
    const out = await run({
      resource: "calendar",
      operation: "availability",
      calendar: { mode: "id", value: "primary" },
      startTime: "2026-08-01T00:00:00Z",
      endTime: "2026-08-01T02:00:00Z",
      options: { outputFormat: "bookedSlots" },
    });

    expect(out[0][0].json).toMatchObject({
      bookedSlots: [{ start: "2026-08-01T01:00:00Z", end: "2026-08-01T01:30:00Z" }],
    });
  });

  // Acceptance: Create a calendar event (test from spec)
  it("creates a calendar event", async () => {
    const createResponse = {
      id: "event-id-123",
      status: "confirmed",
      summary: "Team standup",
      description: "Daily sync meeting",
      start: { dateTime: "2026-08-01T00:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2026-08-01T01:00:00Z", timeZone: "UTC" },
      attendees: [{ email: "alice@example.com", responseStatus: "needsAction" }],
      htmlLink: "https://www.google.com/calendar/event?eid=abc123",
      creator: { email: "me@example.com" },
      organizer: { email: "me@example.com" },
    };
    installFetch(mockResponse(createResponse));
    const out = await run({
      resource: "event",
      operation: "create",
      calendar: { mode: "id", value: "primary" },
      startTime: "2026-08-01T00:00:00Z",
      endTime: "2026-08-01T01:00:00Z",
      options: {
        summary: "Team standup",
        description: "Daily sync meeting",
        attendees: [{ email: "alice@example.com" }],
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/calendars/primary/events");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.start.dateTime).toBe("2026-08-01T00:00:00Z");
    expect(sentBody.end.dateTime).toBe("2026-08-01T01:00:00Z");
    expect(sentBody.summary).toBe("Team standup");
    expect(sentBody.description).toBe("Daily sync meeting");
    expect(sentBody.attendees).toEqual([{ email: "alice@example.com" }]);
    expect(out[0][0].json).toMatchObject({
      id: "event-id-123",
      status: "confirmed",
      summary: "Team standup",
    });
  });

  // Acceptance: Get all events in a date range (test from spec)
  it("gets all events in a date range", async () => {
    const listResponse = {
      items: [
        {
          id: "evt-1",
          summary: "Team standup",
          start: { dateTime: "2026-08-03T09:00:00Z" },
          end: { dateTime: "2026-08-03T09:30:00Z" },
          status: "confirmed",
        },
      ],
    };
    installFetch(mockResponse(listResponse));
    const out = await run({
      resource: "event",
      operation: "getAll",
      calendar: { mode: "id", value: "primary" },
      returnAll: true,
      after: "2026-08-03T00:00:00Z",
      before: "2026-08-09T23:59:59Z",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/calendars/primary/events");
    expect(calls[0].url).toContain("timeMin=");
    expect(calls[0].url).toContain("timeMax=");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "evt-1",
      summary: "Team standup",
      status: "confirmed",
    });
  });

  // Acceptance: Delete an event by ID (test from spec)
  it("deletes an event by ID", async () => {
    installFetch(mockResponse({}));
    const out = await run({
      resource: "event",
      operation: "delete",
      calendar: { mode: "id", value: "primary" },
      eventId: "={{ $json.eventId }}",
    }, [{ eventId: "abc123def" }]);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/calendars/primary/events/abc123def");
    expect(out[0][0].json).toEqual({ success: true });
  });

  // Acceptance: Update an event summary (test from spec)
  it("updates an event summary", async () => {
    const updateResponse = {
      id: "existing-event-id",
      status: "confirmed",
      summary: "Updated: Team standup",
      description: "Rescheduled daily sync",
      start: { dateTime: "2026-08-01T10:00:00Z" },
      end: { dateTime: "2026-08-01T11:00:00Z" },
      htmlLink: "https://www.google.com/calendar/event?eid=xyz",
    };
    installFetch(mockResponse(updateResponse));
    const out = await run({
      resource: "event",
      operation: "update",
      calendar: { mode: "id", value: "primary" },
      eventId: "existing-event-id",
      updateFields: {
        summary: "Updated: Team standup",
        description: "Rescheduled daily sync",
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toContain("/calendars/primary/events/existing-event-id");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.summary).toBe("Updated: Team standup");
    expect(sentBody.description).toBe("Rescheduled daily sync");
    expect(out[0][0].json).toMatchObject({
      id: "existing-event-id",
      summary: "Updated: Team standup",
    });
  });

  // Edge: Missing credential
  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "event",
          operation: "get",
          calendar: { mode: "id", value: "primary" },
          eventId: "some-event",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/googleCalendarOAuth2Api credential is not configured/);
  });

  // Edge: continueOnFail
  it("continueOnFail emits error item and continues", async () => {
    installFetch(mockResponse({ error: { message: "Not found" } }, { status: 404 }));
    const out = await run(
      {
        resource: "event",
        operation: "get",
        calendar: { mode: "id", value: "primary" },
        eventId: "bad-id",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
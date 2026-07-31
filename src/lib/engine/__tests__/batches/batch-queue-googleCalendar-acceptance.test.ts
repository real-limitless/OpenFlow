import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleCalendar";
const CREDS = { googleCalendarOAuth2Api: { accessToken: "tok_cal" } };

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

type Handler = (
  url: string,
  method: string,
  body?: unknown,
) => ReturnType<typeof mockResponse>;
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
    credentials: { googleCalendarOAuth2Api: { name: "googleCalendarOAuth2Api" } },
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

describe("googleCalendar executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("event create with basic fields", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/calendars/primary/events")) {
        return mockResponse({
          id: "evt-1",
          summary: "Test event",
          description: "Created by automated test",
          location: "Conference Room A",
          start: { dateTime: "2026-08-01T09:00:00Z" },
          end: { dateTime: "2026-08-01T10:00:00Z" },
          status: "confirmed",
          kind: "calendar#event",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "event",
      operation: "create",
      calendar: { mode: "list", value: "primary" },
      startTime: "2026-08-01T09:00:00Z",
      endTime: "2026-08-01T10:00:00Z",
      useDefaultReminders: true,
      options: {
        summary: "Test event",
        description: "Created by automated test",
        location: "Conference Room A",
      },
    });

    expect(out[0][0].json).toMatchObject({
      id: "evt-1",
      summary: "Test event",
      description: "Created by automated test",
      location: "Conference Room A",
      start: { dateTime: "2026-08-01T09:00:00Z" },
      end: { dateTime: "2026-08-01T10:00:00Z" },
      status: "confirmed",
    });
    expect(lastMethod).toBe("POST");
    expect(lastBody).toMatchObject({
      summary: "Test event",
      description: "Created by automated test",
      location: "Conference Room A",
      start: { dateTime: "2026-08-01T09:00:00Z" },
      end: { dateTime: "2026-08-01T10:00:00Z" },
      reminders: { useDefault: true },
    });
  });

  it("calendar availability check (available)", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/freeBusy")) {
        return mockResponse({
          calendars: {
            primary: { busy: [] },
          },
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "calendar",
      operation: "availability",
      calendar: { mode: "list", value: "primary" },
      startTime: "2026-08-01T09:00:00Z",
      endTime: "2026-08-01T10:00:00Z",
      options: { outputFormat: "availability" },
    });

    expect(out[0][0].json).toEqual({ available: true });
    expect(lastUrl).toContain("/freeBusy");
    expect(lastBody).toMatchObject({
      timeMin: "2026-08-01T09:00:00Z",
      timeMax: "2026-08-01T10:00:00Z",
      items: [{ id: "primary" }],
    });
  });

  it("event get by ID", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/events/abc123")) {
        return mockResponse({
          id: "abc123",
          kind: "calendar#event",
          status: "confirmed",
          summary: "Standup",
          start: { dateTime: "2026-08-01T09:00:00Z" },
          end: { dateTime: "2026-08-01T09:30:00Z" },
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "event",
        operation: "get",
        calendar: { mode: "list", value: "primary" },
        eventId: "={{ $json.eventId }}",
      },
      [{ eventId: "abc123" }],
    );

    expect(out[0][0].json).toMatchObject({
      id: "abc123",
      kind: "calendar#event",
      status: "confirmed",
      summary: "Standup",
      start: expect.any(Object),
      end: expect.any(Object),
    });
  });

  it("event delete", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("/events/abc123")) {
        return mockResponse(null, 204);
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "event",
        operation: "delete",
        calendar: { mode: "list", value: "primary" },
        eventId: "={{ $json.eventId }}",
      },
      [{ eventId: "abc123" }],
    );

    expect(out[0][0].json).toEqual({ success: true });
    expect(lastMethod).toBe("DELETE");
    expect(lastUrl).toContain("/events/abc123");
  });

  it("get many with limit and time range", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/calendars/primary/events")) {
        return mockResponse({
          items: Array.from({ length: 10 }, (_, i) => ({
            id: `e${i}`,
            summary: `Event ${i}`,
            status: "confirmed",
            start: { dateTime: `2026-08-0${(i % 7) + 1}T09:00:00Z` },
            end: { dateTime: `2026-08-0${(i % 7) + 1}T10:00:00Z` },
          })),
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "event",
      operation: "getAll",
      calendar: { mode: "list", value: "primary" },
      returnAll: false,
      limit: 10,
      after: "2026-08-01T00:00:00Z",
      before: "2026-08-07T23:59:59Z",
      options: {
        orderBy: "startTime",
        showDeleted: false,
        recurringEventHandling: "allOccurrences",
      },
    });

    expect(out[0].length).toBeLessThanOrEqual(10);
    expect(out[0].length).toBeGreaterThan(0);
    for (const item of out[0]) {
      expect(item.json).toMatchObject({
        id: expect.any(String),
        start: expect.any(Object),
        end: expect.any(Object),
        summary: expect.any(String),
        status: expect.any(String),
      });
    }
    expect(lastUrl).toContain("timeMin=");
    expect(lastUrl).toContain("timeMax=");
    expect(lastUrl).toContain("orderBy=startTime");
    expect(lastUrl).toContain("maxResults=10");
  });

  it("continueOnFail returns error json", async () => {
    installFetch(() => mockResponse({ error: { message: "Not Found" } }, 404));
    const out = await run(
      {
        resource: "event",
        operation: "get",
        calendar: { mode: "list", value: "primary" },
        eventId: "missing",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("Not Found") });
  });
});

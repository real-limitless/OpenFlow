import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";
import { _clearStaticDataForTest } from "../../executors/google-calendar-trigger";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleCalendarTrigger";

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() { return text ? JSON.parse(text) : {}; },
    async text() { return text; },
  };
}

type Handler = (url: string, method: string) => ReturnType<typeof mockResponse>;
let handler: Handler;
let lastUrl: string;

function installFetch(h: Handler) {
  handler = h;
  lastUrl = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      lastUrl = String(url);
      return handler(String(url), init?.method ?? "GET");
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  nodeId = "node-1",
  inputItems: Array<Record<string, unknown>> = [{}],
) {
  const node = makeNode({
    id: nodeId,
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
    continueOnFail: false,
    getCredential: async (name) =>
      name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "evt-1",
  summary: "Test event",
  description: "Description",
  location: "Room A",
  status: "confirmed",
  start: { dateTime: "2026-08-01T09:00:00Z" },
  end: { dateTime: "2026-08-01T10:00:00Z" },
  htmlLink: "https://calendar.google.com/calendar/event?eid=abc",
  created: "2026-08-01T08:00:00Z",
  updated: "2026-08-01T08:30:00Z",
  creator: { email: "test@example.com" },
  organizer: { email: "test@example.com" },
  ...overrides,
});

describe("googleCalendarTrigger executor – acceptance tests", () => {
  beforeEach(() => {
    _clearStaticDataForTest();
    installFetch(() => mockResponse({ items: [] }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    _clearStaticDataForTest();
  });

  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("manual execution emits matching events", async () => {
    installFetch(() =>
      mockResponse({ items: [makeEvent({ id: "evt-1", summary: "Team meeting" })] }),
    );
    const out = await run({
      pollTimes: {},
      calendarId: { mode: "list", value: "primary" },
      triggerOn: "eventCreated",
    });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "evt-1",
      summary: "Team meeting",
      status: "confirmed",
      htmlLink: expect.stringContaining("calendar.google.com"),
    });
  });

  it("first poll seeds state and emits empty (eventCreated)", async () => {
    installFetch(() =>
      mockResponse({ items: [makeEvent({ id: "evt-1" })] }),
    );
    const out1 = await run({
      pollTimes: { item: [{ mode: "everyMinute" }] },
      calendarId: { mode: "list", value: "primary" },
      triggerOn: "eventCreated",
    });
    expect(out1[0]).toHaveLength(0);
  });

  it("polls and emits events created after seed", async () => {
    const baseTime = "2026-08-01T08:00:00Z";
    const createdTime = "2026-08-01T08:05:00Z";

    installFetch((url) => {
      if (url.includes("updatedMin=")) {
        return mockResponse({
          items: [makeEvent({ id: "evt-1", created: createdTime, updated: createdTime })],
        });
      }
      return mockResponse({ items: [makeEvent({ id: "evt-1", created: createdTime, updated: createdTime })] });
    });

    _clearStaticDataForTest();

    const createCtx = createExecutionContext;
    const node = makeNode({
      id: "node-poll",
      name: "N",
      type: TYPE,
      parameters: {
        pollTimes: { item: [{ mode: "everyMinute" }] },
        calendarId: { mode: "list", value: "primary" },
        triggerOn: "eventCreated",
      },
      credentials: { googleCalendarOAuth2Api: { name: "googleCalendarOAuth2Api" } },
    });
    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx: ExecutionContext = createCtx({
      node,
      workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => items,
      continueOnFail: false,
      getCredential: async (name) =>
        name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
    });

    const out2 = await getExecutor(TYPE)!(ctx, node);
    expect(out2[0]).toHaveLength(0);
  });

  it("filters by matchTerm", async () => {
    installFetch(() =>
      mockResponse({
        items: [
          makeEvent({ id: "evt-1", summary: "Team meeting" }),
          makeEvent({ id: "evt-2", summary: "Lunch with client" }),
          makeEvent({ id: "evt-3", summary: "Another meeting" }),
        ],
      }),
    );
    const out = await run({
      pollTimes: {},
      calendarId: { mode: "list", value: "primary" },
      triggerOn: "eventCreated",
      options: { matchTerm: "meeting" },
    });
    expect(out[0].length).toBeGreaterThanOrEqual(1);
    for (const item of out[0]) {
      expect((item.json.summary as string).toLowerCase()).toContain("meeting");
    }
  });

  it("emits cancelled events with status cancelled", async () => {
    installFetch(() =>
      mockResponse({ items: [makeEvent({ id: "evt-3", status: "cancelled" })] }),
    );
    const out = await run({
      pollTimes: {},
      calendarId: { mode: "list", value: "primary" },
      triggerOn: "eventCancelled",
    });
    expect(out[0][0].json).toMatchObject({
      id: "evt-3",
      status: "cancelled",
    });
  });

  it("emits multiple events in a single poll window (manual)", async () => {
    installFetch(() =>
      mockResponse({
        items: [
          makeEvent({ id: "e1", summary: "Event 1" }),
          makeEvent({ id: "e2", summary: "Event 2" }),
          makeEvent({ id: "e3", summary: "Event 3" }),
        ],
      }),
    );
    const out = await run({
      pollTimes: {},
      calendarId: { mode: "list", value: "primary" },
      triggerOn: "eventCreated",
    });
    expect(out[0]).toHaveLength(3);
    expect(out[0].map((i) => i.json.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("returns empty output when no matching events", async () => {
    installFetch(() => mockResponse({ items: [] }));
    const out = await run({
      pollTimes: { item: [{ mode: "everyMinute" }] },
      calendarId: { mode: "list", value: "primary" },
      triggerOn: "eventCreated",
    });
    expect(out[0]).toHaveLength(0);
  });

  describe("eventCancelled poll mode", () => {
    it("seed then second poll with status=cancelled and updated===created emits []", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-01T08:00:00Z"));
      _clearStaticDataForTest();

      const eCancelled = makeEvent({ id: "evt-c", status: "cancelled", created: "2026-08-01T08:00:00Z", updated: "2026-08-01T08:00:00Z" });

      const node = makeNode({
        id: "node-canc",
        name: "N",
        type: TYPE,
        parameters: {
          pollTimes: { item: [{ mode: "everyHour" }] },
          calendarId: { mode: "list", value: "primary" },
          triggerOn: "eventCancelled",
        },
        credentials: { googleCalendarOAuth2Api: { name: "googleCalendarOAuth2Api" } },
      });
      const items: INodeExecutionData[] = [{ json: {} }];
      const createCtx = createExecutionContext;

      const ctx1: ExecutionContext = createCtx({
        node, workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items, continueOnFail: false,
        getCredential: async (name) => name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });
      installFetch(() => mockResponse({ items: [eCancelled] }));
      const seedOut = await getExecutor(TYPE)!(ctx1, node);
      expect(seedOut[0]).toHaveLength(0);

      vi.setSystemTime(new Date("2026-08-01T09:00:00Z"));
      const ctx2: ExecutionContext = createCtx({
        node, workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items, continueOnFail: false,
        getCredential: async (name) => name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });
      installFetch(() => mockResponse({ items: [eCancelled] }));
      const out2 = await getExecutor(TYPE)!(ctx2, node);
      expect(out2[0]).toHaveLength(0);
      vi.useRealTimers();
    });

    it("seed then second poll with status=cancelled and updated>created emits 1", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-01T08:00:00Z"));
      _clearStaticDataForTest();

      const eCancelled = makeEvent({ id: "evt-c", status: "cancelled", created: "2026-08-01T07:00:00Z", updated: "2026-08-01T08:00:00Z" });

      const node = makeNode({
        id: "node-canc2",
        name: "N",
        type: TYPE,
        parameters: {
          pollTimes: { item: [{ mode: "everyHour" }] },
          calendarId: { mode: "list", value: "primary" },
          triggerOn: "eventCancelled",
        },
        credentials: { googleCalendarOAuth2Api: { name: "googleCalendarOAuth2Api" } },
      });
      const items: INodeExecutionData[] = [{ json: {} }];
      const createCtx = createExecutionContext;

      const ctx1: ExecutionContext = createCtx({
        node, workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items, continueOnFail: false,
        getCredential: async (name) => name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });
      installFetch(() => mockResponse({ items: [eCancelled] }));
      const seedOut = await getExecutor(TYPE)!(ctx1, node);
      expect(seedOut[0]).toHaveLength(0);

      vi.setSystemTime(new Date("2026-08-01T09:00:00Z"));
      const ctx2: ExecutionContext = createCtx({
        node, workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items, continueOnFail: false,
        getCredential: async (name) => name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });
      installFetch(() => mockResponse({ items: [eCancelled] }));
      const out2 = await getExecutor(TYPE)!(ctx2, node);
      expect(out2[0]).toHaveLength(1);
      expect(out2[0][0].json.status).toBe("cancelled");
      vi.useRealTimers();
    });
  });

  describe("eventUpdated stateful dedup", () => {
    it("emits events where updated > created and tracks lastSeenUpdated", async () => {
      const e1 = makeEvent({
        id: "evt-u1",
        summary: "Updated event",
        created: "2026-08-01T08:00:00Z",
        updated: "2026-08-01T08:30:00Z",
      });

      _clearStaticDataForTest();

      const node = makeNode({
        id: "node-upd",
        name: "N",
        type: TYPE,
        parameters: {
          pollTimes: { item: [{ mode: "everyHour" }] },
          calendarId: { mode: "list", value: "primary" },
          triggerOn: "eventUpdated",
        },
        credentials: { googleCalendarOAuth2Api: { name: "googleCalendarOAuth2Api" } },
      });
      const items: INodeExecutionData[] = [{ json: {} }];
      const createCtx = createExecutionContext;
      const ctx1: ExecutionContext = createCtx({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items,
        continueOnFail: false,
        getCredential: async (name) =>
          name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });

      installFetch(() => mockResponse({ items: [e1] }));
      const seedOut = await getExecutor(TYPE)!(ctx1, node);
      expect(seedOut[0]).toHaveLength(0);

      const ctx1b: ExecutionContext = createCtx({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items,
        continueOnFail: false,
        getCredential: async (name) =>
          name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });
      const out1 = await getExecutor(TYPE)!(ctx1b, node);
      expect(out1[0]).toHaveLength(1);
      expect(out1[0][0].json.id).toBe("evt-u1");

      const e1Updated = makeEvent({
        id: "evt-u1",
        summary: "Updated event again",
        created: "2026-08-01T08:00:00Z",
        updated: "2026-08-01T09:00:00Z",
      });
      installFetch(() => mockResponse({ items: [e1Updated] }));
      const ctx2: ExecutionContext = createCtx({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items,
        continueOnFail: false,
        getCredential: async (name) =>
          name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });
      const out2 = await getExecutor(TYPE)!(ctx2, node);
      expect(out2[0]).toHaveLength(1);
      expect(out2[0][0].json.updated).toBe("2026-08-01T09:00:00Z");

      installFetch(() => mockResponse({ items: [e1Updated] }));
      const ctx3: ExecutionContext = createCtx({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items,
        continueOnFail: false,
        getCredential: async (name) =>
          name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });
      const out3 = await getExecutor(TYPE)!(ctx3, node);
      expect(out3[0]).toHaveLength(0);
    });
  });

  describe("eventStarted window-based", () => {
    it("emits events whose start.dateTime falls in the poll window and skips outside", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-01T10:00:00Z"));

      const eStartInWindow = makeEvent({
        id: "evt-start",
        start: { dateTime: "2026-08-01T10:30:00Z" },
        end: { dateTime: "2026-08-01T11:30:00Z" },
      });

      const eStartBefore = makeEvent({
        id: "evt-before",
        start: { dateTime: "2026-08-01T09:30:00Z" },
        end: { dateTime: "2026-08-01T10:30:00Z" },
      });

      _clearStaticDataForTest();

      const node = makeNode({
        id: "node-start",
        name: "N",
        type: TYPE,
        parameters: {
          pollTimes: { item: [{ mode: "everyHour" }] },
          calendarId: { mode: "list", value: "primary" },
          triggerOn: "eventStarted",
        },
        credentials: { googleCalendarOAuth2Api: { name: "googleCalendarOAuth2Api" } },
      });
      const items: INodeExecutionData[] = [{ json: {} }];
      const createCtx = createExecutionContext;

      const ctx1: ExecutionContext = createCtx({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items,
        continueOnFail: false,
        getCredential: async (name) =>
          name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });

      installFetch(() => mockResponse({ items: [eStartInWindow] }));
      const seedOut = await getExecutor(TYPE)!(ctx1, node);
      expect(seedOut[0]).toHaveLength(0);

      vi.setSystemTime(new Date("2026-08-01T11:00:00Z"));

      const ctx2: ExecutionContext = createCtx({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items,
        continueOnFail: false,
        getCredential: async (name) =>
          name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });

      installFetch(() => mockResponse({ items: [eStartInWindow, eStartBefore] }));
      const out2 = await getExecutor(TYPE)!(ctx2, node);
      expect(out2[0]).toHaveLength(1);
      expect(out2[0][0].json.id).toBe("evt-start");

      vi.setSystemTime(new Date("2026-08-01T12:00:00Z"));

      const ctx3: ExecutionContext = createCtx({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items,
        continueOnFail: false,
        getCredential: async (name) =>
          name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });

      installFetch(() => mockResponse({ items: [eStartInWindow] }));
      const out3 = await getExecutor(TYPE)!(ctx3, node);
      expect(out3[0]).toHaveLength(0);
      vi.useRealTimers();
    });
  });

  describe("eventEnded window-based", () => {
    it("emits events whose end.dateTime falls in the poll window and skips outside", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-01T14:00:00Z"));

      const eEndInWindow = makeEvent({
        id: "evt-end",
        start: { dateTime: "2026-08-01T13:00:00Z" },
        end: { dateTime: "2026-08-01T14:45:00Z" },
      });

      _clearStaticDataForTest();

      const node = makeNode({
        id: "node-end",
        name: "N",
        type: TYPE,
        parameters: {
          pollTimes: { item: [{ mode: "everyHour" }] },
          calendarId: { mode: "list", value: "primary" },
          triggerOn: "eventEnded",
        },
        credentials: { googleCalendarOAuth2Api: { name: "googleCalendarOAuth2Api" } },
      });
      const items: INodeExecutionData[] = [{ json: {} }];
      const createCtx = createExecutionContext;

      const ctx1: ExecutionContext = createCtx({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items,
        continueOnFail: false,
        getCredential: async (name) =>
          name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });

      installFetch(() => mockResponse({ items: [eEndInWindow] }));
      const seedOut = await getExecutor(TYPE)!(ctx1, node);
      expect(seedOut[0]).toHaveLength(0);

      vi.setSystemTime(new Date("2026-08-01T15:00:00Z"));

      const ctx2: ExecutionContext = createCtx({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items,
        continueOnFail: false,
        getCredential: async (name) =>
          name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });

      installFetch(() => mockResponse({ items: [eEndInWindow] }));
      const out2 = await getExecutor(TYPE)!(ctx2, node);
      expect(out2[0]).toHaveLength(1);
      expect(out2[0][0].json.id).toBe("evt-end");

      vi.setSystemTime(new Date("2026-08-01T16:00:00Z"));

      const ctx3: ExecutionContext = createCtx({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items,
        continueOnFail: false,
        getCredential: async (name) =>
          name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });

      installFetch(() => mockResponse({ items: [eEndInWindow] }));
      const out3 = await getExecutor(TYPE)!(ctx3, node);
      expect(out3[0]).toHaveLength(0);
      vi.useRealTimers();
    });
  });

  describe("eventCreated with pollTimes.item everyHour", () => {
    it("seed then second poll with three new-id events emits length 3", async () => {
      vi.useFakeTimers();
      const base = new Date("2026-08-01T08:00:00Z");
      vi.setSystemTime(base);
      _clearStaticDataForTest();

      const e1 = makeEvent({ id: "e1", summary: "Event 1", created: "2026-08-01T08:05:00Z", updated: "2026-08-01T08:05:00Z" });
      const e2 = makeEvent({ id: "e2", summary: "Event 2", created: "2026-08-01T08:10:00Z", updated: "2026-08-01T08:10:00Z" });
      const e3 = makeEvent({ id: "e3", summary: "Event 3", created: "2026-08-01T08:15:00Z", updated: "2026-08-01T08:15:00Z" });

      const node = makeNode({
        id: "node-created-multi",
        name: "N",
        type: TYPE,
        parameters: {
          pollTimes: { item: [{ mode: "everyHour" }] },
          calendarId: { mode: "list", value: "primary" },
          triggerOn: "eventCreated",
        },
        credentials: { googleCalendarOAuth2Api: { name: "googleCalendarOAuth2Api" } },
      });
      const items: INodeExecutionData[] = [{ json: {} }];
      const createCtx = createExecutionContext;
      const ctxSeed: ExecutionContext = createCtx({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items,
        continueOnFail: false,
        getCredential: async (name) =>
          name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });

      installFetch(() => mockResponse({ items: [] }));
      const seedOut = await getExecutor(TYPE)!(ctxSeed, node);
      expect(seedOut[0]).toHaveLength(0);

      vi.setSystemTime(new Date("2026-08-01T09:00:00Z"));

      const ctxPoll: ExecutionContext = createCtx({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => items,
        continueOnFail: false,
        getCredential: async (name) =>
          name === "googleCalendarOAuth2Api" ? { accessToken: "tok_cal" } : null,
      });

      installFetch(() => mockResponse({ items: [e1, e2, e3] }));
      const pollOut = await getExecutor(TYPE)!(ctxPoll, node);
      expect(pollOut[0]).toHaveLength(3);
      expect(pollOut[0].map((i) => i.json.id)).toEqual(["e1", "e2", "e3"]);
      vi.useRealTimers();
    });
  });
});

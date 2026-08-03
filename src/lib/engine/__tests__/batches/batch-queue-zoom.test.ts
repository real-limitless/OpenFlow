import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.zoom";

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
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
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response?: ReturnType<typeof mockResponse>) {
  nextResponse = response ?? mockResponse({});
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

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
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
    getCredential: async (name: string) => {
      if (name === "zoomApi") {
        return { accessToken: "test-token-123" };
      }
      return null;
    },
  });
}

async function runZoom(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
) {
  const node = makeNode({ name: "Zoom", type: TYPE, parameters: params });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx = makeCtx(items, node);
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error("Zoom executor not registered");
  return executor(ctx, node);
}

describe("Zoom node", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("registration", () => {
    it("executor is registered", () => {
      expect(getExecutor(TYPE)).toBeDefined();
    });

    it("description is registered", () => {
      const desc = getNodeType(TYPE);
      expect(desc.name).toBe(TYPE);
      expect(desc.displayName).toBe("Zoom");
      expect(desc.category).toBe("Communication");
    });
  });

  describe("meeting create", () => {
    it("creates a scheduled meeting and returns API response", async () => {
      const apiResponse = {
        id: 123456789,
        join_url: "https://zoom.us/j/123456789",
        start_url: "https://zoom.us/s/123456789",
        topic: "Weekly Sync",
        duration: 30,
        timezone: "America/New_York",
        type: 2,
        agenda: "",
        password: "abc123",
        settings: {
          host_video: true,
          participant_video: false,
          mute_upon_entry: true,
          waiting_room: false,
        },
      };
      nextResponse = mockResponse(apiResponse);

      const [result] = await runZoom({
        resource: "meeting",
        operation: "create",
        topic: "Weekly Sync",
        type: "scheduled",
        startTime: "2026-08-03T15:00:00Z",
        duration: 30,
        timezone: "America/New_York",
        password: "abc123",
        settings: {
          host_video: true,
          participant_video: false,
          mute_upon_entry: true,
          waiting_room: false,
        },
      });

      expect(result.length).toBe(1);
      expect(result[0].json.id).toBe(123456789);
      expect(result[0].json.join_url).toBe("https://zoom.us/j/123456789");
      expect(result[0].json.topic).toBe("Weekly Sync");
      expect(result[0].json.duration).toBe(30);
      expect(result[0].json.timezone).toBe("America/New_York");

      // Verify request details
      expect(calls.length).toBe(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/users/me/meetings");
      const body = JSON.parse(calls[0].body ?? "{}");
      expect(body.type).toBe(2);
      expect(body.topic).toBe("Weekly Sync");
      expect(body.password).toBe("abc123");
    });
  });

  describe("meeting get", () => {
    it("gets a meeting by ID", async () => {
      const apiResponse = {
        id: 987654321,
        topic: "Standup",
        join_url: "https://zoom.us/j/987654321",
        settings: {},
      };
      nextResponse = mockResponse(apiResponse);

      const [result] = await runZoom(
        {
          resource: "meeting",
          operation: "get",
          meetingId: "987654321",
        },
        [{ meetingId: "987654321" }],
      );

      expect(result.length).toBe(1);
      expect(result[0].json.id).toBe(987654321);
      expect(result[0].json.topic).toBe("Standup");
      expect(calls[0].url).toContain("/meetings/987654321");
      expect(calls[0].method).toBe("GET");
    });
  });

  describe("meeting getAll", () => {
    it("lists meetings with pagination", async () => {
      const apiResponse = {
        meetings: [
          { id: 1, topic: "Meeting 1", join_url: "https://zoom.us/j/1", type: 2 },
          { id: 2, topic: "Meeting 2", join_url: "https://zoom.us/j/2", type: 2 },
        ],
        next_page_token: "",
      };
      nextResponse = mockResponse(apiResponse);

      const [result] = await runZoom({
        resource: "meeting",
        operation: "getAll",
        returnAll: false,
        limit: 30,
      });

      expect(result.length).toBe(2);
      expect(result[0].json.topic).toBe("Meeting 1");
      expect(calls[0].url).toContain("/users/me/meetings");
      expect(calls[0].method).toBe("GET");
    });
  });

  describe("meeting delete", () => {
    it("passes through input item on delete", async () => {
      nextResponse = mockResponse(null, 204);

      const [result] = await runZoom(
        {
          resource: "meeting",
          operation: "delete",
          meetingId: "123456",
        },
        [{ customField: "value" }],
      );

      expect(result.length).toBe(1);
      expect(result[0].json.customField).toBe("value");
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toContain("/meetings/123456");
    });
  });

  describe("meeting registrant create", () => {
    it("creates a registrant and returns response", async () => {
      const apiResponse = {
        registrant_id: "abc123",
        join_url: "https://zoom.us/j/123456",
        topic: "Webinar",
        start_time: "2026-08-03T15:00:00Z",
      };
      nextResponse = mockResponse(apiResponse);

      const [result] = await runZoom(
        {
          resource: "meetingRegistrant",
          operation: "create",
          meetingId: "123456",
          email: "test@example.com",
          firstName: "Jane",
          lastName: "Doe",
        },
        [{ meetingId: "123456" }],
      );

      expect(result.length).toBe(1);
      expect(result[0].json.registrant_id).toBe("abc123");
      expect(result[0].json.topic).toBe("Webinar");
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/meetings/123456/registrants");
    });
  });

  describe("webinar create", () => {
    it("creates a webinar", async () => {
      const apiResponse = {
        id: 555,
        topic: "Big Event",
        join_url: "https://zoom.us/j/555",
        start_url: "https://zoom.us/s/555",
      };
      nextResponse = mockResponse(apiResponse);

      const [result] = await runZoom({
        resource: "webinar",
        operation: "create",
        topic: "Big Event",
        type: "webinar",
      });

      expect(result.length).toBe(1);
      expect(result[0].json.id).toBe(555);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/users/me/webinars");
      const body = JSON.parse(calls[0].body ?? "{}");
      expect(body.type).toBe(5);
    });
  });

  describe("error handling", () => {
    it("throws on missing credential", async () => {
      const node = makeNode({ name: "Zoom", type: TYPE, parameters: { resource: "meeting", operation: "get", meetingId: "1" } });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE)!;
      await expect(executor(ctx, node)).rejects.toThrow("zoomApi credential");
    });

    it("throws on API error", async () => {
      nextResponse = mockResponse({ message: "Meeting not found" }, 404);
      await expect(
        runZoom({ resource: "meeting", operation: "get", meetingId: "99999" }),
      ).rejects.toThrow("Zoom API error");
    });
  });
});

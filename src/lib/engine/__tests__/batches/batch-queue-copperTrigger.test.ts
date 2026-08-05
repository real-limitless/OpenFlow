import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.copperTrigger";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function mockResponse(body: unknown, init: { status?: number; contentType?: string } = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 201 ? "Created" : status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
      forEach(fn: (v: string, k: string) => void) { map.forEach((v, k) => fn(v, k)); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
    async arrayBuffer() { return Buffer.from(text); },
  };
}

function installFetch(responses?: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>>) {
  responseQueue = responses
    ? (Array.isArray(responses) ? [...responses] : [responses])
    : [];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url,
      method: (init?.method as string) ?? "GET",
      headers,
      body: init?.body as string | undefined,
    });
    return responseQueue.shift() ?? mockResponse({});
  }));
}

const mockCreds = {
  copperApi: { apiKey: "test-key-123", email: "bot@example.com" },
};

describe("n8n-nodes-base.copperTrigger", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("processes incoming webhook notification as pass-through", async () => {
    const notification = {
      ids: [123],
      type: "person",
      event: "update",
      subscription_id: 1,
      updated_attributes: { email: ["old@example.com", "new@example.com"] },
      timestamp: "2021-12-13T19:18:22.084Z",
    };

    const out = await runNode(TYPE, {}, [{ json: notification }]);

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(notification);
  });

  it("handles batched IDs in a single notification", async () => {
    const notification = {
      ids: [101, 102, 103],
      type: "lead",
      event: "delete",
      subscription_id: 2,
      timestamp: "2021-12-13T19:18:22.084Z",
    };

    const out = await runNode(TYPE, {}, [{ json: notification }]);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.ids).toEqual([101, 102, 103]);
    expect(out[0][0].json.event).toBe("delete");
  });

  it("activates and creates subscriptions", async () => {
    const subscriptionResponses: ReturnType<typeof mockResponse>[] = [];
    for (let i = 0; i < 21; i++) {
      subscriptionResponses.push(mockResponse({ id: 1000 + i }, { status: 201 }));
    }
    installFetch(subscriptionResponses);

    const out = await runNode(TYPE, {
      mode: "activate",
      events: ["New", "Update", "Delete"],
      additionalOptions: {},
      callbackUrl: "https://example.com/webhook",
    }, [{}], { credentials: mockCreds });

    expect(out[0]).toHaveLength(1);
    const ids = (out[0][0].json as { subscriptionIds: number[] }).subscriptionIds;
    expect(ids).toHaveLength(21);
    expect(calls).toHaveLength(21);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/webhooks/subscription");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.type).toBe("lead");
    expect(body.event).toBe("new");
    expect(body.target).toBe("https://example.com/webhook");
  });

  it("activates with single event and secret", async () => {
    const responses: ReturnType<typeof mockResponse>[] = [];
    for (let i = 0; i < 7; i++) {
      responses.push(mockResponse({ id: 2000 + i }, { status: 201 }));
    }
    installFetch(responses);

    const out = await runNode(TYPE, {
      mode: "activate",
      events: ["Update"],
      additionalOptions: {
        secret: { values: [{ key: "verify", value: "abc123" }] },
      },
      callbackUrl: "https://example.com/webhook",
    }, [{}], { credentials: mockCreds });

    expect(out[0]).toHaveLength(1);
    const ids = (out[0][0].json as { subscriptionIds: number[] }).subscriptionIds;
    expect(ids).toHaveLength(7);
    expect(calls).toHaveLength(7);
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.event).toBe("update");
    expect(body.verify).toBe("abc123");
  });

  it("deactivates and deletes subscriptions", async () => {
    const deleteResponses: ReturnType<typeof mockResponse>[] = [];
    for (let i = 0; i < 3; i++) {
      deleteResponses.push(mockResponse(null, { status: 204 }));
    }
    installFetch(deleteResponses);

    const out = await runNode(TYPE, {
      mode: "deactivate",
      subscriptionIds: [1001, 1002, 1003],
    }, [{}], { credentials: mockCreds });

    expect(calls).toHaveLength(3);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/webhooks/subscription/1001");
  });
});

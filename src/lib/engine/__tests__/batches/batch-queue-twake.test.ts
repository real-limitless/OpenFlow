import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.twake";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: new Map(),
    async text() {
      return JSON.stringify(body);
    },
  };
}

let fetchCalls: Array<{ url: string; init: RequestInit }> = [];

function installFetch(routes: Record<string, unknown>) {
  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init: init ?? {} });
      const key = String(url);
      if (key in routes) {
        return mockJsonResponse(routes[key]);
      }
      if (key.includes("/api/v1/messages/save")) {
        return mockJsonResponse(null, 200);
      }
      return mockJsonResponse({ error: "Not found" }, 404);
    }),
  );
}

function installErrorFetch() {
  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return mockJsonResponse({ error: "Invalid channel_id" }, 403);
    }),
  );
}

describe("twake", () => {
  beforeEach(() => {
    fetchCalls = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe(TYPE);
    expect(desc.displayName).toBe("Twake");
    expect(desc.category).toBe("Productivity");
  });

  it("sendMessage sends to correct endpoint", async () => {
    const mockResponse = {
      object: {
        id: "msg_001",
        channel_id: "ch_abc123",
        sender: null,
        content: "Hello from n8n",
        creation_date: 1712345678,
        modification_date: 1712345679,
        reactions: [],
        application_id: "app_001",
      },
    };
    installFetch({ "https://api.twake.app/api/v1/messages/save": mockResponse });

    const input = [{ json: { channel: "ch_abc123", text: "Hello from n8n" } }];
    const params = {
      operation: "sendMessage",
      channelId: "={{ $json.channel }}",
      content: "={{ $json.text }}",
    };
    const creds = { twakeCloudApi: { workspaceKey: "wk_test_key" } };
    const [out] = await runNode(TYPE, params, input, { credentials: creds });

    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(mockResponse);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("https://api.twake.app/api/v1/messages/save");
  });

  it("includes group_id when provided", async () => {
    const mockResponse = {
      object: {
        id: "msg_002",
        channel_id: "ch_def456",
        content: "Scoped message",
        creation_date: 1712345680,
        modification_date: 1712345681,
        reactions: [],
      },
    };
    installFetch({ "https://api.twake.app/api/v1/messages/save": mockResponse });

    const params = {
      operation: "sendMessage",
      channelId: "ch_def456",
      content: "Scoped message",
      groupId: "grp_789",
    };
    const creds = { twakeCloudApi: { workspaceKey: "wk_test_key" } };
    await runNode(TYPE, params, [{}], { credentials: creds });

    const body = JSON.parse(String(fetchCalls[0].init.body ?? "{}"));
    expect(body.group_id).toBe("grp_789");
    expect(body.message.channel_id).toBe("ch_def456");
  });

  it("includes ephemeral flag when set", async () => {
    const mockResponse = {
      object: {
        id: "msg_003",
        channel_id: "ch_xyz",
        content: "Only app sees this",
        creation_date: 1712345682,
        modification_date: 1712345683,
        reactions: [],
      },
    };
    installFetch({ "https://api.twake.app/api/v1/messages/save": mockResponse });

    const params = {
      operation: "sendMessage",
      channelId: "ch_xyz",
      content: "Only app sees this",
      ephemeral: true,
    };
    const creds = { twakeCloudApi: { workspaceKey: "wk_test_key" } };
    await runNode(TYPE, params, [{}], { credentials: creds });

    const body = JSON.parse(String(fetchCalls[0].init.body ?? "{}"));
    expect(body.message._once_ephemeral_message).toBe(true);
  });

  it("handles continueOnFail", async () => {
    installErrorFetch();

    const input = [
      { json: { channel: "valid_ch", text: "ok" } },
      { json: { channel: "", text: "bad" } },
    ];
    const params = {
      operation: "sendMessage",
      channelId: "={{ $json.channel }}",
      content: "={{ $json.text }}",
    };
    const creds = { twakeCloudApi: { workspaceKey: "wk_test_key" } };
    const [out] = await runNode(TYPE, params, input, { continueOnFail: true, credentials: creds });

    expect(out).toHaveLength(2);
    expect(out[0].json).toBeDefined();
    expect(out[1].json.error).toBeDefined();
  });

  it("uses server credentials when cloud credentials are missing", async () => {
    const mockResponse = {
      object: {
        id: "msg_004",
        channel_id: "ch_srv",
        content: "Server message",
        creation_date: 1712345684,
        modification_date: 1712345685,
        reactions: [],
      },
    };
    installFetch({ "https://twake.example.com/api/v1/messages/save": mockResponse });

    const params = {
      operation: "sendMessage",
      channelId: "ch_srv",
      content: "Server message",
    };
    const creds = {
      twakeServerApi: {
        hostUrl: "https://twake.example.com",
        publicId: "pub_123",
        privateApiKey: "key_456",
      },
    };
    const [out] = await runNode(TYPE, params, [{}], { credentials: creds });

    expect(out).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("https://twake.example.com/api/v1/messages/save");
  });

  it("throws when no credentials", async () => {
    await expect(
      runNode(TYPE, { operation: "sendMessage", channelId: "ch", content: "text" }, [{}]),
    ).rejects.toThrow("credentials are required");
  });

  it("throws on unsupported operation", async () => {
    const creds = { twakeCloudApi: { workspaceKey: "wk_test_key" } };
    await expect(
      runNode(TYPE, { operation: "deleteMessage", channelId: "ch", content: "text" }, [{}], { credentials: creds }),
    ).rejects.toThrow("unsupported operation");
  });
});

import { describe, it, expect, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.slackHitlTool";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];

function mockResponse(body: unknown) {
  const text = JSON.stringify(body ?? { ok: true });
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: {
      get(_name: string) { return "application/json"; },
      entries() { return new Map().entries(); },
      forEach() {},
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ ok: true })) {
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

function makeCtx(
  node: INode,
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
    getNodeInputItems: () => [{ json: {} }],
    continueOnFail: false,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

describe(TYPE, () => {
  it("is registered as executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("is registered as description", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
  });

  it("throws when channel is missing", async () => {
    const executor = getExecutor(TYPE)!;
    const node = {
      id: "1",
      name: "Slack HITL",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    };
    const ctx = makeCtx(node, { slackApi: { accessToken: "xoxb-test-token" } });
    await expect(executor(ctx, node)).rejects.toThrow("channel parameter is required");
  });

  it("throws when credential is missing", async () => {
    const executor = getExecutor(TYPE)!;
    const node = {
      id: "1",
      name: "Slack HITL",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: { channel: "C123" },
    };
    const ctx = makeCtx(node, {});
    await expect(executor(ctx, node)).rejects.toThrow("Slack HITL: Slack credentials required");
  });

  it("sends approval message to Slack with default text", async () => {
    installFetch(mockResponse({ ok: true, channel: "C123", ts: "1700000000.000100" }));

    const executor = getExecutor(TYPE)!;
    const node = {
      id: "1",
      name: "Slack HITL",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        channel: "C1234567890",
      },
    };
    const ctx = makeCtx(node, { slackApi: { accessToken: "xoxb-test-token" } });

    Object.defineProperty(ctx, "toolName", { value: "Send Email" });
    Object.defineProperty(ctx, "toolParameters", { value: { to: "user@example.com", subject: "Hello" } });

    const result = await executor(ctx, node);

    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://slack.com/api/chat.postMessage");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["Authorization"]).toBe("Bearer xoxb-test-token");

    const body = JSON.parse(calls[0].body!);
    expect(body.channel).toBe("C1234567890");
    expect(body.text).toContain("Send Email");
    expect(body.text).toContain('"to"');
    expect(body.text).toContain("user@example.com");
    expect(body.text).toContain('"subject"');
    expect(body.text).toContain("Hello");
    expect(body.attachments[0].actions[0].text).toBe("Approve");
    expect(body.attachments[0].actions[1].text).toBe("Deny");
    expect(body.attachments[0].actions[0].style).toBe("primary");
    expect(body.attachments[0].actions[1].style).toBe("danger");

    expect(result[0][0].json.channel).toBe("C1234567890");
    expect(result[0][0].json.status).toBe("pending_approval");
  });

  it("uses custom message and button labels", async () => {
    installFetch(mockResponse({ ok: true, channel: "C456", ts: "1700000000.000200" }));

    const executor = getExecutor(TYPE)!;
    const node = {
      id: "1",
      name: "Slack HITL",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        channel: "C4567890123",
        approveButtonText: "Yes, proceed",
        denyButtonText: "No, stop",
      },
    };
    const ctx = makeCtx(node, { slackApi: { accessToken: "xoxb-test-token" } });

    Object.defineProperty(ctx, "toolName", { value: "Create Ticket" });
    Object.defineProperty(ctx, "toolParameters", { value: { title: "Bug report" } });

    await executor(ctx, node);

    const body = JSON.parse(calls[0].body!);
    expect(body.attachments[0].actions[0].text).toBe("Yes, proceed");
    expect(body.attachments[0].actions[1].text).toBe("No, stop");
  });

  it("throws on Slack API error", async () => {
    const errorResponse = {
      ok: false,
      status: 200,
      statusText: "OK",
      headers: {
        get(_name: string) { return "application/json"; },
        entries() { return new Map().entries(); },
        forEach() {},
      },
      async json() { return { ok: false, error: "channel_not_found" }; },
      async text() { return JSON.stringify({ ok: false, error: "channel_not_found" }); },
    };
    installFetch(errorResponse as any);

    const executor = getExecutor(TYPE)!;
    const node = {
      id: "1",
      name: "Slack HITL",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        channel: "CINVALID",
      },
    };
    const ctx = makeCtx(node, { slackApi: { accessToken: "xoxb-test-token" } });

    await expect(executor(ctx, node)).rejects.toThrow(/channel_not_found/);
  });
});

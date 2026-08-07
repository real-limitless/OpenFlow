import { describe, it, expect, beforeEach, vi } from "vitest";
import { seedBuiltinExecutors } from "@/lib/engine";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { createExecutionContext } from "@/sdk";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.moceanTool";

type FetchCall = { url: string; body: string };
let fetchCalls: FetchCall[] = [];

const mockResponseBody = JSON.stringify({
  status: 0,
  msgid: "test-msg-123",
});

beforeEach(() => {
  fetchCalls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const body = init && typeof init === "object" && "body" in init ? String(init.body) : "";
    fetchCalls.push({ url, body });

    let responseBody = mockResponseBody;
    if (body.includes("mocean-from=")) {
      responseBody = JSON.stringify({
        status: 0,
        msgid: "test-msg-123",
      });
    }

    return new Response(responseBody, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeCtx(
  items: INodeExecutionData[],
  parameters: Record<string, unknown>,
  continueOnFail = false,
): ReturnType<typeof createExecutionContext> {
  const node = makeNode({ name: "MoceanToolTest", type: TYPE, parameters });
  const creds = {
    moceanApi: { apiKey: "test-key", apiSecret: "test-secret" },
  };
  return createExecutionContext({
    node,
    workflow: {
      id: "test",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name: string) => (creds as Record<string, Record<string, unknown>>)[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function runTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  continueOnFail = false,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, parameters, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue moceanTool — n8n-nodes-base.moceanTool", () => {
  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mocean (AI Tool)");
  });

  it("sends an SMS and returns API response", async () => {
    const out = await runTool(
      { resource: "sms", from: "AcmeInc", to: "+1234567890", message: "Hello from AI agent" },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("status", 0);
    expect(out[0][0].json).toHaveProperty("msgid", "test-msg-123");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).toContain("mocean-from=AcmeInc");
    expect(fetchCalls[0].body).toContain("mocean-to=%2B1234567890");
    expect(fetchCalls[0].body).toContain("mocean-text=Hello+from+AI+agent");
  });

  it("sends a voice message with language parameter", async () => {
    const out = await runTool(
      { resource: "voice", from: "AcmeInc", to: "+1234567890", message: "This is a voice message", language: "en-US" },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("status", 0);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).toContain("mocean-command");
    const commandEncoded =
      fetchCalls[0].body
        .split("&")
        .find((p) => p.startsWith("mocean-command="))
        ?.replace("mocean-command=", "") ?? "";
    const command = JSON.parse(decodeURIComponent(commandEncoded.replace(/\+/g, " ")));
    expect(command).toHaveProperty("mocean-tts-lang", "en-US");
    expect(command).toHaveProperty("mocean-tts-text", "This is a voice message");
  });

  it("includes dlrUrl from options", async () => {
    await runTool(
      { resource: "sms", from: "AcmeInc", to: "+1234567890", message: "Hello", options: { dlrUrl: "https://example.com/callback" } },
      [{ json: {} }],
    );
    expect(fetchCalls[0].body).toContain("mocean-dlr-url");
    expect(fetchCalls[0].body).toContain("https%3A%2F%2Fexample.com%2Fcallback");
  });

  it("continueOnFail returns error item for missing credentials", async () => {
    const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "sms", from: "A", to: "B", message: "C" } });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("continueOnFail returns error item for missing required parameters", async () => {
    const out = await runTool(
      { resource: "sms", from: "", to: "", message: "" },
      [{ json: {} }],
      true,
    );
    expect(out[0][0].json).toHaveProperty("error");
    const errMsg = (out[0][0].json.error as Record<string, unknown>).message as string;
    expect(errMsg).toMatch(/required/);
  });

  it("processes multiple input items", async () => {
    const out = await runTool(
      { resource: "sms", from: "AcmeInc", to: "+1234567890", message: "Batch test" },
      [{ json: {} }, { json: {} }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("status", 0);
    expect(out[0][1].json).toHaveProperty("status", 0);
    expect(fetchCalls).toHaveLength(2);
  });

  it("throws on missing from parameter when not continueOnFail", async () => {
    await expect(
      runTool({ resource: "sms", to: "+1234567890", message: "Hello" }, [{ json: {} }]),
    ).rejects.toThrow(/from.*required/);
  });

  it("throws on missing credential when not continueOnFail", async () => {
    const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "sms", from: "A", to: "B", message: "C" } });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/credential is required/);
  });
});

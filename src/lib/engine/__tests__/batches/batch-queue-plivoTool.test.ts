import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "@/lib/engine";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { sdkHttpRequest } from "@/sdk/helpers/http";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.plivoTool";

vi.mock("@/sdk/helpers/http", () => ({
  sdkHttpRequest: vi.fn(async (options: any) => {
    if (options.url.includes("/Message/")) {
      return {
        body: {
          api_id: "dummy-api-id",
          message: "message(s) queued",
          message_uuid: ["dummy-uuid"],
        },
      };
    }
    if (options.url.includes("/Call/")) {
      return {
        body: {
          api_id: "dummy-api-id",
          message: "call requested",
          request_uuid: "dummy-request-uuid",
        },
      };
    }
    return { body: {} };
  }),
}));

function makeCtx(
  items: INodeExecutionData[],
  parameters: Record<string, unknown>,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  const node = makeNode({ name: "PlivoToolTest", type: TYPE, parameters });
  const defaultCreds = {
    plivoApi: {
      authId: "MAUTHID",
      authToken: "token123",
    },
  };
  const creds = credentials ?? defaultCreds;
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
    continueOnFail: false,
    getCredential: async (name) => creds[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown>>): INodeExecutionData[] {
  return input.map((i) => ({ json: i }));
}

function runPlivoTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>>,
  credentials?: Record<string, Record<string, unknown>>,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, parameters, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue plivoTool — n8n-nodes-base.plivoTool", () => {
  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Plivo Tool");
  });

  it("sends SMS with correct API body", async () => {
    const out = await runPlivoTool(
      { resource: "sms", from: "+14156667777", to: "+14156667778", message: "Hello from AI agent" },
      [{}],
    );
    expect(out[0][0].json).toHaveProperty("message", "message(s) queued");
    expect(out[0][0].json).toHaveProperty("message_uuid");
    expect(out[0][0].json).toHaveProperty("api_id");

    expect(sdkHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: expect.stringContaining("/Message/"),
        body: { src: "+14156667777", dst: "+14156667778", text: "Hello from AI agent" },
      }),
    );
  });

  it("sends MMS with media", async () => {
    const out = await runPlivoTool(
      { resource: "mms", from: "+14156667777", to: "+14156667778", message: "Check this", media_urls: "https://example.com/image.png" },
      [{}],
    );
    expect(out[0][0].json).toHaveProperty("message", "message(s) queued");

    expect(sdkHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: expect.stringContaining("/Message/"),
        body: { src: "+14156667777", dst: "+14156667778", text: "Check this", type: "mms", media_urls: "https://example.com/image.png" },
      }),
    );
  });

  it("makes a call with correct API body", async () => {
    const out = await runPlivoTool(
      { resource: "call", from: "+14156667777", to: "+14156667778", answer_url: "https://example.com/answer.xml", answer_method: "GET" },
      [{}],
    );
    expect(out[0][0].json).toHaveProperty("message", "call requested");
    expect(out[0][0].json).toHaveProperty("request_uuid");

    expect(sdkHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: expect.stringContaining("/Call/"),
        body: { from: "+14156667777", to: "+14156667778", answer_url: "https://example.com/answer.xml", answer_method: "GET" },
      }),
    );
  });

  it("fails when missing required from field for SMS", async () => {
    await expect(
      runPlivoTool({ resource: "sms", to: "+14156667778", message: "Hello" }, [{}]),
    ).rejects.toThrow(/from/);
  });

  it("returns error on missing credential with continueOnFail", async () => {
    const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "sms", from: "+1", to: "+2", message: "x" } });
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

  it("handles multi-item input", async () => {
    const out = await runPlivoTool(
      { resource: "sms", from: "+14156667777", to: "+14156667778", message: "bulk" },
      [{}, {}],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("api_id");
    expect(out[0][1].json).toHaveProperty("api_id");
  });
});

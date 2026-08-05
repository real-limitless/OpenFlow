import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "@/lib/engine";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { sdkHttpRequest } from "@/sdk/helpers/http";
import { vi } from "vitest";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.gotifyTool";

let mockNextResponse: any = null;

vi.mock("@/sdk/helpers/http", () => ({
  sdkHttpRequest: vi.fn(async (options: any) => {
    if (options.method === "POST" && typeof options.url === "string" && options.url.endsWith("/message")) {
      return {
        body: {
          id: 1,
          appid: 1,
          message: options.body?.message ?? "",
          title: options.body?.title ?? null,
          priority: options.body?.priority ?? 0,
          date: new Date().toISOString(),
        },
      };
    }
    if (options.method === "DELETE") {
      return { body: {} };
    }
    if (options.method === "GET") {
      const resp = mockNextResponse ?? {
        messages: [{ id: 1, appid: 1, message: "test", priority: 0 }],
        paging: {},
      };
      mockNextResponse = null;
      return { body: resp };
    }
    return { body: {} };
  }),
}));

function makeCtx(
  items: INodeExecutionData[],
  parameters: Record<string, unknown>,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  const node = makeNode({ name: "GotifyToolTest", type: TYPE, parameters });
  const defaultCreds = {
    gotifyApi: {
      url: "https://gotify.example.com",
      appApiToken: "app-token",
      clientToken: "client-token",
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

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function runGotifyTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials?: Record<string, Record<string, unknown>>,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, parameters, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue gotifyTool — n8n-nodes-base.gotifyTool", () => {
  afterEach(() => {
    mockNextResponse = null;
  });

  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Gotify (AI Tool)");
  });

  it("creates a message on create operation", async () => {
    const out = await runGotifyTool(
      { operation: "create", message: "Server disk space low", additionalFields: { title: "Alert", priority: 8 } },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("message", "Server disk space low");
    expect(out[0][0].json).toHaveProperty("title", "Alert");
    expect(out[0][0].json).toHaveProperty("priority", 8);
    expect(out[0][0].json).toHaveProperty("id");
    expect(out[0][0].json).toHaveProperty("appid");
  });

  it("creates a message with only required field (default priority 0)", async () => {
    const out = await runGotifyTool({ operation: "create", message: "test" }, [
      { json: {} },
    ]);
    expect(out[0][0].json).toHaveProperty("message", "test");
    expect(out[0][0].json).toHaveProperty("priority", 0);
  });

  it("deletes a message on delete operation and merges original input", async () => {
    const out = await runGotifyTool({ operation: "delete", messageId: 42 }, [
      { json: { msgId: 42 } },
    ]);
    expect(out[0][0].json).toMatchObject({ success: true, msgId: 42 });
  });

  it("gets messages on getAll operation returning { messages, paging } per item", async () => {
    mockNextResponse = { messages: [{ id: 1, message: "hello" }], paging: { limit: 20 } };
    const out = await runGotifyTool(
      { operation: "getAll", limit: 5, returnAll: false },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("messages");
    expect(out[0][0].json).toHaveProperty("paging");
    expect(Array.isArray(out[0][0].json.messages)).toBe(true);
    expect(out[0][0].json.messages).toHaveLength(1);
  });

  it("fails when required message param is missing for create", async () => {
    await expect(runGotifyTool({ operation: "create" }, [{ json: {} }])).rejects.toThrow(
      /message is required/,
    );
  });

  it("handles multi-item create across input items", async () => {
    const out = await runGotifyTool(
      { operation: "create", message: "item" },
      [{ json: {} }, { json: {} }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("message", "item");
    expect(out[0][1].json).toHaveProperty("message", "item");
  });

  it("returns error items on continueOnFail for missing credential", async () => {
    const node = makeNode({ name: "N", type: TYPE, parameters: { operation: "create", message: "x" } });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test",
        name: "Test",
        active: false,
        nodes: [node],
        connections: {},
        settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0][0].json).toHaveProperty("error");
  });
});

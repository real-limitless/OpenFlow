import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.microsoftAgent365Trigger";

async function runTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [],
): Promise<ReturnType<typeof getExecutor>> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const input = inputItems.map((item) => ({ json: item }));
  const ctx = makeCtx(input, node);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue microsoftAgent365Trigger — @n8n/n8n-nodes-langchain.microsoftAgent365Trigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Microsoft Agent 365 Trigger");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("emits bot framework activity fields for a single incoming request", async () => {
    const out = await runTrigger(
      { systemPrompt: "You are a helpful assistant." },
      [
        {
          activityId: "a1",
          from: { id: "user1", name: "Alice" },
          conversation: { id: "conv1", conversationType: "personal" },
          text: "Hello",
          type: "message",
          timestamp: "2025-01-01T00:00:00.000Z",
          channelId: "msteams",
          serviceUrl: "https://smba.trafficmanager.net/amer/",
          headers: { authorization: "Bearer fake" },
          query: {},
          webhookUrl: "https://hooks.example.com",
          executionMode: "test",
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.activityId).toBe("a1");
    expect(out[0][0].json.from).toEqual({ id: "user1", name: "Alice" });
    expect(out[0][0].json.conversation).toEqual({ id: "conv1", conversationType: "personal" });
    expect(out[0][0].json.text).toBe("Hello");
    expect(out[0][0].json.type).toBe("message");
    expect(out[0][0].json.channelId).toBe("msteams");
    expect(out[0][0].json.serviceUrl).toBe("https://smba.trafficmanager.net/amer/");
    expect(out[0][0].json.systemPrompt).toBe("You are a helpful assistant.");
  });

  it("empty input emits single empty item", async () => {
    const out = await runTrigger({}, []);
    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("defaults activity fields when input is minimal", async () => {
    const out = await runTrigger({}, [{ text: "hi" }]);
    expect(out[0][0].json.activityId).toBe("");
    expect(out[0][0].json.from).toEqual({ id: "", name: "" });
    expect(out[0][0].json.text).toBe("hi");
    expect(out[0][0].json.type).toBe("message");
    expect(out[0][0].json.channelId).toBe("msteams");
  });

  it("includes metadata when systemPrompt is provided", async () => {
    const out = await runTrigger(
      { systemPrompt: "Be concise." },
      [{ text: "hello" }],
    );
    expect(out[0][0].json.systemPrompt).toBe("Be concise.");
  });

  it("includes useMcpTools=true with all tools by default", async () => {
    const out = await runTrigger(
      { useMcpTools: true },
      [{ text: "hello" }],
    );
    expect(out[0][0].json.useMcpTools).toBe(true);
    expect(Array.isArray(out[0][0].json.includeTools)).toBe(true);
    expect(out[0][0].json.includeTools).toContain("mcp_CalendarTools");
    expect(out[0][0].json.includeTools).toContain("mcp_MailTools");
  });

  it("filters MCP tools when include=selected", async () => {
    const out = await runTrigger(
      {
        useMcpTools: true,
        include: "selected",
        includeTools: ["mcp_CalendarTools", "mcp_MailTools"],
      },
      [{ text: "hello" }],
    );
    expect(out[0][0].json.useMcpTools).toBe(true);
    expect(out[0][0].json.includeTools).toEqual(["mcp_CalendarTools", "mcp_MailTools"]);
  });

  it("filters out unknown MCP tool IDs", async () => {
    const out = await runTrigger(
      {
        useMcpTools: true,
        include: "selected",
        includeTools: ["mcp_CalendarTools", "unknown_tool"],
      },
      [{ text: "hello" }],
    );
    expect(out[0][0].json.includeTools).toEqual(["mcp_CalendarTools"]);
  });

  it("includes welcomeMessage and maxIterations when set", async () => {
    const out = await runTrigger(
      {
        options: {
          welcomeMessage: "Welcome!",
          maxIterations: 10,
        },
      },
      [{ text: "hello" }],
    );
    expect(out[0][0].json.welcomeMessage).toBe("Welcome!");
    expect(out[0][0].json.maxIterations).toBe(10);
  });

  it("preserves binary data from input item", async () => {
    const node = makeNode({ name: "N", type: TYPE, parameters: {} });
    const input = [{ json: { text: "hi" }, binary: { data: { data: "dGVzdA==", mimeType: "text/plain" } } }];
    const ctx = makeCtx(input, node);
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0][0].binary).toEqual({ data: { data: "dGVzdA==", mimeType: "text/plain" } });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setAnthropicToolHttpClient,
  type AnthropicToolHttpClient,
} from "../../executors/n8n-nodes-langchain.anthropicTool";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.anthropicTool";
const ANTHROPIC_CRED = { anthropicApi: { apiKey: "sk-ant-test-key" } };

function mockHttp(body: unknown, status = 200): AnthropicToolHttpClient {
  return async () => ({
    status,
    headers: {},
    body,
  });
}

function runTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = ANTHROPIC_CRED,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items: INodeExecutionData[] = inputItems.map((i) =>
    i && typeof i === "object" && "json" in i ? (i as INodeExecutionData) : { json: i as Record<string, unknown> },
  );
  const ctx = createExecutionContext({
    node,
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

describe("batch-queue @n8n/n8n-nodes-langchain.anthropicTool", () => {
  beforeEach(() => {
    setAnthropicToolHttpClient(null);
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("Anthropic Tool");
  });

  it("tool-text-message: returns assistant reply", async () => {
    setAnthropicToolHttpClient(mockHttp({
      content: [{ type: "text", text: "Here is a summary of the text you provided." }],
      model: "claude-sonnet-4-20250514",
    }));

    const [output] = (await runTool({}, [
      {
        json: {
          resource: "text",
          operation: "message",
          modelId: { mode: "id", value: "claude-sonnet-4-20250514" },
          messages: { values: [{ content: "Summarize this text", role: "user" }] },
          simplify: true,
        },
      },
    ])) as INodeExecutionData[][];

    const json = output[0].json as Record<string, unknown>;
    expect(json.messages).toBeDefined();
    expect((json.messages as Array<unknown>).length).toBeGreaterThanOrEqual(1);
    expect((json.messages as Array<Record<string, unknown>>)[0].content).toEqual(
      "Here is a summary of the text you provided.",
    );
  });

  it("tool-image-analyze: returns description", async () => {
    setAnthropicToolHttpClient(mockHttp({
      content: [{ type: "text", text: "The image shows a scenic mountain landscape." }],
      model: "claude-sonnet-4-20250514",
    }));

    const [output] = (await runTool({}, [
      {
        json: {
          resource: "image",
          operation: "analyze",
          modelId: { mode: "id", value: "claude-sonnet-4-20250514" },
          text: "What's in this image?",
          inputType: "url",
          imageUrls: "https://example.com/photo.png",
          simplify: true,
        },
      },
    ])) as INodeExecutionData[][];

    expect((output[0].json as Record<string, unknown>).description).toBeDefined();
  });

  it("tool-file-list: returns file metadata array", async () => {
    setAnthropicToolHttpClient(
      mockHttp({
        data: [
          { id: "file_1", filename: "doc.pdf", mime_type: "application/pdf", size_bytes: 1024, created_at: "2025-01-01T00:00:00Z" },
        ],
      }),
    );

    const [output] = (await runTool({}, [
      {
        json: {
          resource: "file",
          operation: "list",
          returnAll: false,
          limit: 10,
        },
      },
    ])) as INodeExecutionData[][];

    const json = output[0].json as Record<string, unknown>;
    expect(json.data).toBeDefined();
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("tool-prompt-generate: returns messages and system", async () => {
    setAnthropicToolHttpClient(mockHttp({
      content: [{ type: "text", text: "You are a recipe planning assistant." }],
      model: "claude-sonnet-4-6",
    }));

    const [output] = (await runTool({}, [
      {
        json: {
          resource: "prompt",
          operation: "generate",
          task: "A recipe planner assistant",
          simplify: true,
        },
      },
    ])) as INodeExecutionData[][];

    const json = output[0].json as Record<string, unknown>;
    expect(json.messages).toBeDefined();
    expect(json.system).toBeDefined();
  });

  it("throws when credentials are missing", async () => {
    await expect(
      runTool({}, [{ json: { resource: "text", operation: "message" } }], {}),
    ).rejects.toThrow(/anthropicApi/);
  });

  it("throws on unsupported resource/operation", async () => {
    setAnthropicToolHttpClient(mockHttp({}));

    await expect(
      runTool({}, [{ json: { resource: "unknown", operation: "x" } }]),
    ).rejects.toThrow(/unsupported/);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setAnthropicHttpClient,
  type AnthropicHttpClient,
} from "../../executors/n8n-nodes-langchain.anthropic";

seedBuiltinExecutors();

const TYPE = "@n8n/n8n-nodes-langchain.anthropic";
const ANTHROPIC_CRED = { anthropicApi: { apiKey: "sk-ant-test-key" } };

function mockHttp(body: unknown, status = 200): AnthropicHttpClient {
  return async () => ({
    status,
    headers: {},
    body,
  });
}

function runAnthropic(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = ANTHROPIC_CRED,
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items: INodeExecutionData[] = inputItems.map((i) =>
    i && typeof i === "object" && "json" in i ? (i as INodeExecutionData) : { json: i as Record<string, unknown> },
  );
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

describe("batch-queue @n8n/n8n-nodes-langchain.anthropic", () => {
  beforeEach(() => {
    setAnthropicHttpClient(null);
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("Anthropic");
  });

  it("Text - Message a Model (simplified)", async () => {
    setAnthropicHttpClient(mockHttp({
      content: [{ type: "text", text: "Hello! How can I help you today?" }],
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 5, output_tokens: 5 },
    }));

    const out = await runAnthropic({
      resource: "text",
      operation: "message",
      modelId: { mode: "list", value: "claude-sonnet-4-6" },
      messages: { values: [{ content: "Say hello in one sentence.", role: "user" }] },
      simplify: true,
    });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.content).toEqual([{ type: "text", text: "Hello! How can I help you today?" }]);
    expect(out[0][0].json.merged_response).toBe("Hello! How can I help you today?");
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
  });

  it("Text - Message a Model (raw)", async () => {
    const rawBody = {
      id: "msg_123",
      content: [{ type: "text", text: "Hello!" }],
      model: "claude-sonnet-4-6",
      role: "assistant",
      usage: { input_tokens: 5, output_tokens: 2 },
    };
    setAnthropicHttpClient(mockHttp(rawBody));

    const out = await runAnthropic({
      resource: "text",
      operation: "message",
      modelId: { mode: "list", value: "claude-sonnet-4-6" },
      messages: { values: [{ content: "Hi", role: "user" }] },
      simplify: false,
    });

    expect(out[0][0].json).toMatchObject(rawBody);
  });

  it("Document - Analyze Document (URL)", async () => {
    setAnthropicHttpClient(mockHttp({
      content: [{ type: "text", text: "- Point 1\n- Point 2\n- Point 3" }],
    }));

    const out = await runAnthropic(
      {
        resource: "document",
        operation: "analyze",
        modelId: { mode: "list", value: "claude-sonnet-4-6" },
        text: "Summarize this document in 3 bullet points.",
        inputType: "url",
        documentUrls: "={{ $json.docUrl }}",
        simplify: true,
      },
      [{ docUrl: "https://example.com/report.pdf" }],
    );

    expect(out[0][0].json.content).toEqual([{ type: "text", text: "- Point 1\n- Point 2\n- Point 3" }]);
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
  });

  it("Image - Analyze Image (URL)", async () => {
    setAnthropicHttpClient(mockHttp({
      content: [{ type: "text", text: "The image shows a cat sitting on a windowsill." }],
    }));

    const out = await runAnthropic({
      resource: "image",
      operation: "analyze",
      modelId: { mode: "list", value: "claude-sonnet-4-6" },
      text: "What objects are visible?",
      inputType: "url",
      imageUrls: "https://example.com/cat.png",
      simplify: true,
    });

    expect(out[0][0].json.content).toEqual([{ type: "text", text: "The image shows a cat sitting on a windowsill." }]);
  });

  it("File - Upload File (URL)", async () => {
    setAnthropicHttpClient(async (opts) => {
      if (opts.url?.includes("/v1/files") && opts.method === "POST") {
        return {
          status: 200, headers: {},
          body: { id: "file_abc123", filename: "data.csv", bytes: 1024, created_at: "2026-01-01T00:00:00Z", url: "https://api.anthropic.com/v1/files/file_abc123" },
        };
      }
      return { status: 404, headers: {}, body: {} };
    });

    const out = await runAnthropic(
      {
        resource: "file",
        operation: "upload",
        inputType: "url",
        fileUrl: "={{ $json.fileUrl }}",
        options: { fileName: "data.csv" },
      },
      [{ fileUrl: "https://example.com/data.csv" }],
    );

    expect(out[0][0].json.id).toBe("file_abc123");
    expect(out[0][0].json.filename).toBe("data.csv");
    expect(out[0][0].json.bytes).toBe(1024);
  });

  it("File - Get File Metadata", async () => {
    setAnthropicHttpClient(async (opts) => {
      if (opts.url?.includes("/v1/files/file_xyz")) {
        return { status: 200, headers: {}, body: { id: "file_xyz", filename: "doc.pdf", bytes: 2048 } };
      }
      return { status: 404, headers: {}, body: {} };
    });

    const out = await runAnthropic({
      resource: "file",
      operation: "getMetadata",
      fileId: "file_xyz",
    });

    expect(out[0][0].json.id).toBe("file_xyz");
    expect(out[0][0].json.filename).toBe("doc.pdf");
  });

  it("File - List Files", async () => {
    setAnthropicHttpClient(async (opts) => {
      if (opts.url?.includes("/v1/files")) {
        return { status: 200, headers: {}, body: { data: [{ id: "file_1" }, { id: "file_2" }] } };
      }
      return { status: 404, headers: {}, body: {} };
    });

    const out = await runAnthropic({
      resource: "file",
      operation: "list",
      limit: 50,
    });

    expect(out[0][0].json.data).toHaveLength(2);
  });

  it("File - Delete File", async () => {
    setAnthropicHttpClient(async (opts) => {
      if (opts.url?.includes("/v1/files/file_del") && opts.method === "DELETE") {
        return { status: 200, headers: {}, body: { id: "file_del", deleted: true } };
      }
      return { status: 404, headers: {}, body: {} };
    });

    const out = await runAnthropic({
      resource: "file",
      operation: "delete",
      fileId: "file_del",
    });

    expect(out[0][0].json.deleted).toBe(true);
  });

  it("Prompt - Generate Prompt", async () => {
    setAnthropicHttpClient(mockHttp({
      content: [{ type: "text", text: "Create a weekly meal plan..." }],
    }));

    const out = await runAnthropic(
      {
        resource: "prompt",
        operation: "generate",
        task: "={{ $json.taskDesc }}",
        simplify: true,
      },
      [{ taskDesc: "A chef for a meal prep planning service" }],
    );

    const m = out[0][0].json.messages as Array<{ role: string }>;
    expect(m).toBeDefined();
    expect(out[0][0].json.system).toBeDefined();
    expect(m[0].role).toBe("user");
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
  });

  it("throws on unsupported resource/operation", async () => {
    await expect(
      runAnthropic({
        resource: "text",
        operation: "unknownOperation",
      }),
    ).rejects.toThrow(/unsupported/);
  });

  it("throws on missing credential", async () => {
    await expect(
      runAnthropic(
        {
          resource: "text",
          operation: "message",
          messages: { values: [{ content: "hi", role: "user" }] },
          modelId: { mode: "list", value: "claude-sonnet-4-6" },
        },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "anthropicApi"/i);
  });

  it("processes multiple items independently", async () => {
    let callCount = 0;
    setAnthropicHttpClient(async () => {
      callCount++;
      return { status: 200, headers: {}, body: { content: [{ type: "text", text: `Response ${callCount}` }] } };
    });

    const out = await runAnthropic(
      {
        resource: "text",
        operation: "message",
        modelId: { mode: "list", value: "claude-sonnet-4-6" },
        messages: { values: [{ content: "hi", role: "user" }] },
        simplify: true,
      },
      [{}, {}],
    );

    expect(out[0]).toHaveLength(2);
    expect(callCount).toBe(2);
  });

  it("sends correct model id in request body", async () => {
    let requestBody: unknown = null;
    setAnthropicHttpClient(async (opts) => {
      requestBody = opts.body;
      return { status: 200, headers: {}, body: { content: [{ type: "text", text: "ok" }] } };
    });

    await runAnthropic({
      resource: "text",
      operation: "message",
      modelId: { mode: "list", value: "claude-opus-4-1" },
      messages: { values: [{ content: "hi", role: "user" }] },
      simplify: true,
    });

    const body = requestBody as Record<string, unknown>;
    expect(body.model).toBe("claude-opus-4-1");
  });

  it("sends correct model id from plain string", async () => {
    let requestBody: unknown = null;
    setAnthropicHttpClient(async (opts) => {
      requestBody = opts.body;
      return { status: 200, headers: {}, body: { content: [{ type: "text", text: "ok" }] } };
    });

    await runAnthropic({
      resource: "text",
      operation: "message",
      modelId: "claude-sonnet-4-6",
      messages: { values: [{ content: "hi", role: "user" }] },
      simplify: true,
    });

    const body = requestBody as Record<string, unknown>;
    expect(body.model).toBe("claude-sonnet-4-6");
  });

  it("resolves model id from resource locator without __rl", async () => {
    let requestBody: unknown = null;
    setAnthropicHttpClient(async (opts) => {
      requestBody = opts.body;
      return { status: 200, headers: {}, body: { content: [{ type: "text", text: "ok" }] } };
    });

    await runAnthropic({
      resource: "text",
      operation: "message",
      modelId: { mode: "id", value: "claude-opus-4-1" },
      messages: { values: [{ content: "hi", role: "user" }] },
      simplify: true,
    });

    const body = requestBody as Record<string, unknown>;
    expect(body.model).toBe("claude-opus-4-1");
  });

  it("evaluates expression document URLs per item", async () => {
    let requestBody: unknown = null;
    setAnthropicHttpClient(async (opts) => {
      requestBody = opts.body;
      return { status: 200, headers: {}, body: { content: [{ type: "text", text: "summary" }] } };
    });

    const out = await runAnthropic(
      {
        resource: "document",
        operation: "analyze",
        modelId: { mode: "list", value: "claude-sonnet-4-6" },
        text: "Summarize",
        inputType: "url",
        documentUrls: "={{ $json.docUrl }}",
        simplify: true,
      },
      [{ docUrl: "https://example.com/report.pdf" }],
    );

    const body = requestBody as Record<string, unknown>;
    const msg = (body.messages as Array<Record<string, unknown>>)[0];
    const content = msg.content as Array<Record<string, unknown>>;
    expect((content[0].source as Record<string, unknown>).url).toBe("https://example.com/report.pdf");
    expect(out[0][0].json.content).toBeDefined();
  });

  it("Image - Analyze Image from binary", async () => {
    let requestBody: unknown = null;
    setAnthropicHttpClient(async (opts) => {
      requestBody = opts.body;
      return { status: 200, headers: {}, body: { content: [{ type: "text", text: "A cat" }] } };
    });

    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const out = await runAnthropic(
      {
        resource: "image",
        operation: "analyze",
        modelId: { mode: "list", value: "claude-sonnet-4-6" },
        text: "Describe this image",
        inputType: "binary",
        binaryPropertyName: "data",
        simplify: true,
      },
      [{ json: {}, binary: { data: { mimeType: "image/png", data: pngBase64 } } }],
    );

    const body = requestBody as Record<string, unknown>;
    const msg = (body.messages as Array<Record<string, unknown>>)[0];
    const content = msg.content as Array<Record<string, unknown>>;
    const imageBlock = content.find((c) => c.type === "image") as Record<string, unknown> | undefined;
    expect(imageBlock).toBeDefined();
    const source = imageBlock!.source as Record<string, unknown>;
    expect(source.type).toBe("base64");
    expect(source.media_type).toBe("image/png");
    expect(source.data).toBe(pngBase64);
    expect(out[0][0].json.content).toBeDefined();
  });

  it("File - Upload File from binary", async () => {
    let requestOpts: unknown = null;
    setAnthropicHttpClient(async (opts) => {
      requestOpts = opts;
      return { status: 200, headers: {}, body: { id: "file_bin123", filename: "report.pdf", bytes: 2048 } };
    });

    const pdfBase64 = "JVBERi0xLjQK...";
    const out = await runAnthropic(
      {
        resource: "file",
        operation: "upload",
        inputType: "binary",
        binaryPropertyName: "fileData",
        options: { fileName: "report.pdf" },
      },
      [{ json: {}, binary: { fileData: { mimeType: "application/pdf", data: pdfBase64 } } }],
    );

    const opts = requestOpts as Record<string, unknown>;
    expect(opts.url).toContain("/v1/files");
    expect(opts.method).toBe("POST");
    expect(out[0][0].json.id).toBe("file_bin123");
    expect(out[0][0].json.filename).toBe("report.pdf");
  });

  it("Text - Message with binary attachments", async () => {
    let requestBody: unknown = null;
    setAnthropicHttpClient(async (opts) => {
      requestBody = opts.body;
      return { status: 200, headers: {}, body: { content: [{ type: "text", text: "Document analyzed" }] } };
    });

    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const out = await runAnthropic(
      {
        resource: "text",
        operation: "message",
        modelId: { mode: "list", value: "claude-sonnet-4-6" },
        messages: { values: [{ content: "What's in this attachment?", role: "user" }] },
        addAttachments: true,
        attachmentsInputType: "binary",
        binaryPropertyName: "imageData",
        simplify: true,
      },
      [{ json: {}, binary: { imageData: { mimeType: "image/png", data: pngBase64 } } }],
    );

    const body = requestBody as Record<string, unknown>;
    const msg = (body.messages as Array<Record<string, unknown>>)[0];
    const content = msg.content as Array<Record<string, unknown>>;
    const imageBlock = content.find((c) => c.type === "image") as Record<string, unknown> | undefined;
    expect(imageBlock).toBeDefined();
    const source = imageBlock!.source as Record<string, unknown>;
    expect(source.type).toBe("base64");
    expect(source.media_type).toBe("image/png");
    expect(source.data).toBe(pngBase64);
    expect(out[0][0].json.content).toBeDefined();
  });

  it("sends web search tool in request body", async () => {
    let requestBody: unknown = null;
    setAnthropicHttpClient(async (opts) => {
      requestBody = opts.body;
      return { status: 200, headers: {}, body: { content: [{ type: "text", text: "news" }] } };
    });

    await runAnthropic({
      resource: "text",
      operation: "message",
      modelId: { mode: "list", value: "claude-sonnet-4-6" },
      messages: { values: [{ content: "Latest AI news", role: "user" }] },
      options: { system: "You are a news summarizer", webSearch: true, maxUses: 3 },
      simplify: true,
    });

    const body = requestBody as Record<string, unknown>;
    expect(body.system).toBe("You are a news summarizer");
    expect(body.tools).toBeDefined();
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools.some((t: Record<string, unknown>) => t.type === "web_search_20250305")).toBe(true);
    const ws = tools.find((t: Record<string, unknown>) => t.type === "web_search_20250305")!;
    expect(ws.max_uses).toBe(3);
  });

  it("Prompt - Improve Prompt", async () => {
    setAnthropicHttpClient(mockHttp({
      messages: [{ role: "user", content: "Write a rhyming poem" }],
      system: "Creative writer",
    }));

    const out = await runAnthropic({
      resource: "prompt",
      operation: "improve",
      messages: { values: [{ content: "Write a poem", role: "user" }] },
      options: { system: "Creative writer", feedback: "Make it rhyme" },
      simplify: true,
    });

    expect(out[0][0].json.messages).toBeDefined();
    expect(out[0][0].json.system).toBeDefined();
  });

  it("Prompt - Templatize Prompt", async () => {
    setAnthropicHttpClient(mockHttp({
      messages: [{ role: "user", content: "Write about {topic}" }],
      system: "",
      variable_values: { topic: "" },
    }));

    const out = await runAnthropic({
      resource: "prompt",
      operation: "templatize",
      messages: { values: [{ content: "Write about AI", role: "user" }] },
      simplify: true,
    });

    expect(out[0][0].json.messages).toBeDefined();
    expect(out[0][0].json.variable_values).toBeDefined();
  });
});

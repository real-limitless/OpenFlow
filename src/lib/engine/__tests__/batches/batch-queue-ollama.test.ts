import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setOllamaHttpClient,
  setFetchOverride,
} from "../../executors/ollama-app";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.ollama";

const OLLAMA_CRED = {
  baseUrl: "http://localhost:11434",
};

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
  toolItems?: INodeExecutionData[],
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
    getNodeInputItems: (_name: string, inputIndex?: number) => {
      if (inputIndex === 1 && toolItems) return toolItems;
      return items;
    },
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function runNode(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = { ollamaApi: OLLAMA_CRED },
  toolItems?: INodeExecutionData[],
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, toolItems);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

afterEach(() => { setOllamaHttpClient(null); setFetchOverride(null); });

describe("batch-queue ollama — @n8n/n8n-nodes-langchain.ollama", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Ollama");
  });

  it("text→message sends chat to /api/chat with model + messages, returns simplified output", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({
        url: opts.url,
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: opts.body,
      });
      return {
        status: 200,
        headers: {},
        body: {
          model: "llama3.2",
          message: { role: "assistant", content: "The capital of France is Paris." },
          done: true,
          prompt_eval_count: 10,
          eval_count: 8,
        },
      };
    });

    const out = await runNode({
      resource: "text",
      operation: "message",
      modelId: { __rl: true, mode: "id", value: "llama3.2" },
      messages: {
        values: [{ content: "What is the capital of France?", role: "user" }],
      },
      simplify: true,
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const output = out[0][0].json as Record<string, unknown>;
    expect(output.messages).toBeDefined();
    const messages = output.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content).toContain("Paris");

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("http://localhost:11434/api/chat");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers["content-type"]).toBe("application/json");
    expect(captured[0].headers["authorization"]).toBeUndefined();
    expect(captured[0].body).toMatchObject({
      model: "llama3.2",
      messages: [{ role: "user", content: "What is the capital of France?" }],
      stream: false,
    });
  });

  it("text→message raw output includes full Ollama response", async () => {
    setOllamaHttpClient(async () => ({
      status: 200,
      headers: {},
      body: {
        model: "llama3.2",
        created_at: "2025-01-01T00:00:00Z",
        message: { role: "assistant", content: "Hello!" },
        done: true,
        done_reason: "stop",
        total_duration: 1000,
        prompt_eval_count: 5,
        eval_count: 3,
        eval_duration: 500,
      },
    }));

    const out = await runNode({
      resource: "text",
      operation: "message",
      modelId: { __rl: true, mode: "id", value: "llama3.2" },
      messages: { values: [{ content: "Hi", role: "user" }] },
      simplify: false,
    });

    const raw = out[0][0].json as Record<string, unknown>;
    expect(raw.model).toBe("llama3.2");
    expect(raw.created_at).toBe("2025-01-01T00:00:00Z");
    expect(raw.done_reason).toBe("stop");
    expect(raw.message).toMatchObject({ role: "assistant", content: "Hello!" });
  });

  it("image→analyze with URL fetches image and sends base64 in images array", async () => {
    const captured: Array<{ body: unknown }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          model: "llama3.2-vision",
          message: { role: "assistant", content: "I see a cat." },
          done: true,
        },
      };
    });

    const fakeBase64 = "dGVzdC1pbWFnZS1kYXRh"; // "test-image-data" in base64
    setFetchOverride(async (url: string) => {
      expect(url).toBe("https://example.com/test.png");
      const encoder = new TextEncoder();
      const buf = encoder.encode("test-image-data").buffer as ArrayBuffer;
      return { ok: true, arrayBuffer: async () => buf };
    });

    const out = await runNode({
      resource: "image",
      operation: "analyze",
      modelId: { __rl: true, mode: "id", value: "llama3.2-vision" },
      text: "What's in this image?",
      inputType: "url",
      imageUrls: "https://example.com/test.png",
      simplify: true,
    });

    expect(out[0][0].json).toBeDefined();
    const body = captured[0].body as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string; content: string; images?: string[] }>;
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("What's in this image?");
    expect(messages[0].images).toBeDefined();
    expect(messages[0].images![0]).toBe(fakeBase64);
  });

  it("options passthrough — temperature, num_predict, seed, format json", async () => {
    const captured: Array<{ body: unknown }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          model: "llama3.2",
          message: { role: "assistant", content: '{"key":"value"}' },
          done: true,
        },
      };
    });

    const out = await runNode({
      resource: "text",
      operation: "message",
      modelId: { __rl: true, mode: "id", value: "llama3.2" },
      messages: { values: [{ content: "Hi", role: "user" }] },
      options: {
        temperature: 0.3,
        num_predict: 200,
        seed: 42,
        format: "json",
      },
    });

    const body = captured[0].body as Record<string, unknown>;
    expect(body.format).toBe("json");
    expect(body.options).toMatchObject({
      temperature: 0.3,
      num_predict: 200,
      seed: 42,
    });
  });

  it("image→analyze with binary input sends base64 images", async () => {
    const captured: Array<{ body: unknown }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          model: "llava",
          message: { role: "assistant", content: "A test image." },
          done: true,
        },
      };
    });

    const testBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const out = await runNode(
      {
        resource: "image",
        operation: "analyze",
        modelId: { __rl: true, mode: "id", value: "llava" },
        text: "Describe this image",
        inputType: "binary",
        binaryPropertyName: "data",
        simplify: true,
      },
      [
        {
          json: {},
          binary: {
            data: {
              data: testBase64,
              mimeType: "image/png",
              fileName: "test.png",
            },
          },
        } as unknown as Record<string, unknown>,
      ],
    );

    const body = captured[0].body as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string; content: string; images?: string[] }>;
    expect(messages[0].images).toBeDefined();
    expect(messages[0].images![0]).toBe(testBase64);
  });

  it("image→analyze with binary throws when no binary data found for binaryPropertyName", async () => {
    setOllamaHttpClient(async () => ({
      status: 200,
      headers: {},
      body: { model: "llava", message: { role: "assistant", content: "ok" }, done: true },
    }));

    await expect(
      runNode(
        {
          resource: "image",
          operation: "analyze",
          modelId: { __rl: true, mode: "id", value: "llava" },
          text: "Describe this image",
          inputType: "binary",
          binaryPropertyName: "data",
        },
        [{ json: {} }],
      ),
    ).rejects.toThrow(/Image decode \/ binary field missing/i);
  });

  it("text→message with ai_tool connection sends tools in request body and loops on tool_calls", async () => {
    const requests: Array<{ body: unknown }> = [];

    const getWeatherTool = {
      name: "get_weather",
      description: "Get weather for a location",
      schema: { type: "object", properties: { location: { type: "string" } } },
      invoke: async (args: Record<string, unknown>) => {
        return `Weather in ${args.location}: 72°F, sunny`;
      },
    };

    let callCount = 0;
    setOllamaHttpClient(async (opts) => {
      requests.push({ body: opts.body });
      callCount++;
      const reqBody = opts.body as Record<string, unknown>;

      if (callCount === 1) {
        const messages = reqBody.messages as Array<Record<string, unknown>>;
        expect(messages.length).toBeGreaterThan(0);
        expect(messages[0].role).toBe("user");
        expect(messages[0].content).toBe("What is the weather in Paris?");

        return {
          status: 200,
          headers: {},
          body: {
            model: "qwen3",
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                { function: { name: "get_weather", arguments: '{"location":"Paris"}' } },
              ],
            },
            done: true,
          },
        };
      }

      return {
        status: 200,
        headers: {},
        body: {
          model: "qwen3",
          message: { role: "assistant", content: "The weather in Paris is 72°F and sunny.", tool_calls: undefined },
          done: true,
        },
      };
    });

    const toolItems: INodeExecutionData[] = [{ json: getWeatherTool as unknown as Record<string, unknown> }];

    const out = await runNode(
      {
        resource: "text",
        operation: "message",
        modelId: { __rl: true, mode: "id", value: "qwen3" },
        messages: { values: [{ content: "What is the weather in Paris?", role: "user" }] },
        simplify: true,
      },
      [{}],
      { ollamaApi: OLLAMA_CRED },
      toolItems,
    );

    expect(requests.length).toBe(2);
    const firstBody = requests[0].body as Record<string, unknown>;
    expect(firstBody.tools).toBeDefined();
    expect(firstBody.tools).toHaveLength(1);
    const tool = (firstBody.tools as Array<Record<string, unknown>>)[0];
    expect(tool.type).toBe("function");
    expect((tool.function as Record<string, unknown>).name).toBe("get_weather");

    const secondBody = requests[1].body as Record<string, unknown>;
    const secondMessages = secondBody.messages as Array<Record<string, unknown>>;
    const assistantMsg = secondMessages.find((m) => m.role === "assistant");
    expect(assistantMsg?.tool_calls).toBeDefined();

    const toolMsg = secondMessages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect((toolMsg?.content as string)).toContain("72°F");

    expect(out[0][0].json).toBeDefined();
    const output = out[0][0].json as Record<string, unknown>;
    expect(output.messages).toBeDefined();
  });

  it("throws when ollamaApi credential is missing", async () => {
    await expect(
      runNode(
        {
          resource: "text",
          operation: "message",
          modelId: { __rl: true, mode: "id", value: "llama3.2" },
          messages: { values: [{ content: "Hi", role: "user" }] },
        },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "ollamaApi" is required/i);
  });

  it("throws when modelId is empty", async () => {
    await expect(
      runNode({
        resource: "text",
        operation: "message",
        modelId: { __rl: true, mode: "id", value: "" },
        messages: { values: [{ content: "Hi", role: "user" }] },
      }),
    ).rejects.toThrow(/model id is required/i);
  });

  it("surfaces 404 model-not-found errors clearly", async () => {
    setOllamaHttpClient(async () => ({
      status: 404,
      headers: {},
      body: { error: "model not found" },
    }));

    await expect(
      runNode({
        resource: "text",
        operation: "message",
        modelId: { __rl: true, mode: "id", value: "no-such-model" },
        messages: { values: [{ content: "Hi", role: "user" }] },
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("uses default base URL when credential baseUrl is empty", async () => {
    const captured: Array<{ url: string }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({ url: opts.url });
      return {
        status: 200,
        headers: {},
        body: {
          model: "llama3.2",
          message: { role: "assistant", content: "ok" },
          done: true,
        },
      };
    });

    await runNode(
      {
        resource: "text",
        operation: "message",
        modelId: { __rl: true, mode: "id", value: "llama3.2" },
        messages: { values: [{ content: "Hi", role: "user" }] },
      },
      [{}],
      { ollamaApi: { baseUrl: "" } },
    );

    expect(captured[0].url).toContain("http://localhost:11434");
  });

  it("resolves model id from expression against first item", async () => {
    const captured: Array<{ body: unknown }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          model: "llama3:70b",
          message: { role: "assistant", content: "ok" },
          done: true,
        },
      };
    });

    await runNode(
      {
        resource: "text",
        operation: "message",
        modelId: { __rl: true, mode: "id", value: "={{ $json.ollama_model }}" },
        messages: { values: [{ content: "Hi", role: "user" }] },
      },
      [{ ollama_model: "llama3:70b" }],
    );

    const body = captured[0].body as Record<string, unknown>;
    expect(body.model).toBe("llama3:70b");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

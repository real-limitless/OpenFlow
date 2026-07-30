import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setAnthropicHttpClient,
  type AnthropicModelHandle,
  type AnthropicChatMessage,
} from "../../executors/lm-chat-anthropic";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatAnthropic";

const ANTHROPIC_CRED = {
  apiKey: "sk-ant-test-key",
};

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
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
    getNodeInputItems: () => items,
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

async function runModel(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = { anthropicApi: ANTHROPIC_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): AnthropicModelHandle {
  return out[0][0].json as unknown as AnthropicModelHandle;
}

afterEach(() => setAnthropicHttpClient(null));

describe("batch-queue lmChatAnthropic — @n8n/n8n-nodes-langchain.lmChatAnthropic", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Anthropic Chat Model");
  });

  it("builds a model handle with model + options (wire shape)", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "claude-3-5-sonnet-20241022" },
      options: { maxTokens: 1024, temperature: 0, topP: 1 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("claude-3-5-sonnet-20241022");
    expect(handle.options).toMatchObject({ maxTokens: 1024, temperature: 0, topP: 1 });
    expect(handle.baseUrl).toBe("https://api.anthropic.com");
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.claude_model }}" },
        options: { maxTokens: 2000, temperature: 0.2, topK: 40 },
      },
      [{ claude_model: "claude-3-opus-20240229" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("claude-3-opus-20240229");
  });

  it("accepts a plain string model (non resource-locator)", async () => {
    const out = await runModel({
      model: "claude-3-haiku-20240307",
      options: { maxTokens: 512 },
    });
    expect(getHandle(out).model).toBe("claude-3-haiku-20240307");
  });

  it("throws when anthropicApi credential is missing", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "claude-3-5-sonnet-20241022" }, options: {} },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "anthropicApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "claude-3-5-sonnet-20241022" }, options: {} },
        [{}],
        { anthropicApi: { apiKey: "" } },
      ),
    ).rejects.toThrow(/missing apiKey/);
  });

  it("invoke calls /v1/messages with model, max_tokens, temperature, top_p", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setAnthropicHttpClient(async (opts) => {
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
          content: [{ type: "text", text: "Hello!" }],
          model: "claude-3-5-sonnet-20241022",
          usage: { input_tokens: 5, output_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "claude-3-5-sonnet-20241022" },
      options: { maxTokens: 1024, temperature: 0, topP: 1 },
    });

    const handle = getHandle(out);
    const messages: AnthropicChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello!");
    expect(result.model).toBe("claude-3-5-sonnet-20241022");
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 2 });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers["x-api-key"]).toBe("sk-ant-test-key");
    expect(captured[0].headers["anthropic-version"]).toBe("2023-06-01");
    expect(captured[0].headers["content-type"]).toBe("application/json");
    expect(captured[0].body).toMatchObject({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      temperature: 0,
      top_p: 1,
      system: "You are helpful.",
      messages: [{ role: "user", content: "Hi" }],
    });
  });

  it("invoke sends both top_k and top_p when set", async () => {
    const captured: Array<{ body: unknown }> = [];

    setAnthropicHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          content: [{ type: "text", text: "ok" }],
          model: "claude-3-haiku-20240307",
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "claude-3-haiku-20240307" },
      options: { maxTokens: 512, topK: 5, topP: 0.9 },
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "hi" }]);

    expect(captured[0].body).toMatchObject({
      max_tokens: 512,
      top_k: 5,
      top_p: 0.9,
    });
  });

  it("invoke fails when maxTokens is missing (API requires max_tokens)", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "claude-3-5-sonnet-20241022" },
      options: {},
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(
      /maxTokens is required/i,
    );
  });

  it("surfaces rate-limit errors clearly", async () => {
    setAnthropicHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "claude-3-5-sonnet-20241022" },
      options: { maxTokens: 100, maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/rate limit/i);
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setAnthropicHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          content: [{ type: "text", text: "ok" }],
          model: "claude-3-5-sonnet-20241022",
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "claude-3-5-sonnet-20241022" },
      options: { maxTokens: 100, maxRetries: 2 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke([{ role: "user", content: "hi" }]);
    expect(result.text).toBe("ok");
    expect(calls).toBe(3);
  });

  it("sends custom header when credential configures one", async () => {
    const captured: Array<{ headers: Record<string, string> }> = [];

    setAnthropicHttpClient(async (opts) => {
      captured.push({ headers: opts.headers ?? {} });
      return {
        status: 200,
        headers: {},
        body: {
          content: [{ type: "text", text: "ok" }],
          model: "claude-3-5-sonnet-20241022",
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      };
    });

    const out = await runModel(
      {
        model: { __rl: true, mode: "list", value: "claude-3-5-sonnet-20241022" },
        options: { maxTokens: 100 },
      },
      [{}],
      {
        anthropicApi: {
          apiKey: "sk-ant-test-key",
          header: true,
          headerName: "X-Org",
          headerValue: "my-org",
        },
      },
    );

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "hi" }]);

    expect(captured[0].headers["X-Org"]).toBe("my-org");
    expect(captured[0].headers["x-api-key"]).toBe("sk-ant-test-key");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

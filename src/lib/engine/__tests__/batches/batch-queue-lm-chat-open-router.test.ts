import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setOpenRouterHttpClient,
  type OpenRouterModelHandle,
  type OpenRouterChatMessage,
} from "../../executors/lm-chat-open-router";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatOpenRouter";

const OPENROUTER_CRED = {
  apiKey: "sk-or-test-key",
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
  credentials: Record<string, Record<string, unknown>> = { openRouterApi: OPENROUTER_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): OpenRouterModelHandle {
  return out[0][0].json as unknown as OpenRouterModelHandle;
}

afterEach(() => setOpenRouterHttpClient(null));

describe("batch-queue lmChatOpenRouter — @n8n/n8n-nodes-langchain.lmChatOpenRouter", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("OpenRouter Chat Model");
  });

  it("builds a chat-completions handle with model + options", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "openai/gpt-4o" },
      options: { temperature: 0, maxTokens: 1024, timeout: 120000 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("openai/gpt-4o");
    expect(handle.options).toMatchObject({ temperature: 0, maxTokens: 1024, timeout: 120000 });
    expect(handle.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.or_model }}" },
        options: { temperature: 0.2, maxTokens: 2000 },
      },
      [{ or_model: "anthropic/claude-3.5-sonnet" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("anthropic/claude-3.5-sonnet");
  });

  it("accepts a plain string model (non resource-locator)", async () => {
    const out = await runModel({
      model: "google/gemini-2.0-flash-exp",
      options: {},
    });
    expect(getHandle(out).model).toBe("google/gemini-2.0-flash-exp");
  });

  it("throws when openRouterApi credential is missing", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "openai/gpt-4o" }, options: {} },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "openRouterApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel({ model: { __rl: true, mode: "list", value: "openai/gpt-4o" }, options: {} }, [{}], {
        openRouterApi: { apiKey: "" },
      }),
    ).rejects.toThrow(/missing apiKey/);
  });

  it("invoke calls chat completions endpoint with correct body + bearer auth", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setOpenRouterHttpClient(async (opts) => {
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
          choices: [{ message: { content: "Hello!" } }],
          model: "openai/gpt-4o",
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "openai/gpt-4o" },
      options: { temperature: 0, maxTokens: 1024 },
    });

    const handle = getHandle(out);
    const messages: OpenRouterChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello!");
    expect(result.model).toBe("openai/gpt-4o");
    expect(result.usage).toEqual({
      promptTokens: 5,
      completionTokens: 2,
      totalTokens: 7,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer sk-or-test-key");
    expect(captured[0].body).toMatchObject({
      model: "openai/gpt-4o",
      messages,
      temperature: 0,
      max_tokens: 1024,
    });
    expect((captured[0].body as Record<string, unknown>).tools).toBeUndefined();
  });

  it("sends tools and parses tool_calls for the Agent loop", async () => {
    const captured: Array<{ body: unknown }> = [];
    setOpenRouterHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "read_file", arguments: '{"path":"README.md"}' },
                  },
                ],
              },
            },
          ],
          model: "openai/gpt-4o",
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        },
      };
    });

    const handle = getHandle(
      await runModel({
        model: { __rl: true, mode: "list", value: "openai/gpt-4o" },
        options: {},
      }),
    );
    const result = await handle.invoke(
      [{ role: "user", content: "read the readme" }],
      [
        {
          name: "read_file",
          description: "Read a file",
          schema: { type: "object", properties: { path: { type: "string" } } },
        },
      ],
    );

    expect(result.text).toBe("");
    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "read_file", args: { path: "README.md" } },
    ]);
    expect(captured[0].body).toMatchObject({
      tool_choice: "auto",
      tools: [
        {
          type: "function",
          function: { name: "read_file", description: "Read a file" },
        },
      ],
    });
  });

  it("round-trips assistant tool_calls and role:tool on the next turn", async () => {
    const captured: Array<{ body: unknown }> = [];
    setOpenRouterHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "README is a guide." } }],
          model: "openai/gpt-4o",
          usage: { prompt_tokens: 20, completion_tokens: 6, total_tokens: 26 },
        },
      };
    });

    const handle = getHandle(
      await runModel({
        model: { __rl: true, mode: "list", value: "openai/gpt-4o" },
        options: {},
      }),
    );
    const result = await handle.invoke(
      [
        { role: "user", content: "read the readme" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "read_file", arguments: '{"path":"README.md"}' },
            },
          ],
        },
        { role: "tool", content: "# OpenFlow", tool_call_id: "call_1" },
      ],
      [{ name: "read_file" }],
    );

    expect(result.text).toBe("README is a guide.");
    expect(result.toolCalls).toBeUndefined();
    const messages = (captured[0].body as { messages: Record<string, unknown>[] }).messages;
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call_1", type: "function" }],
    });
    expect(messages[2]).toMatchObject({
      role: "tool",
      content: "# OpenFlow",
      tool_call_id: "call_1",
    });
  });

  it("maps responseFormat json to response_format json_object", async () => {
    const captured: Array<{ body: unknown }> = [];

    setOpenRouterHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "{}" } }],
          model: "openai/gpt-4o-mini",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "openai/gpt-4o-mini" },
      options: { maxTokens: 512, responseFormat: "json" },
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "return json" }]);

    expect(captured[0].body).toMatchObject({
      response_format: { type: "json_object" },
      max_tokens: 512,
    });
  });

  it("maps penalties + topP to snake_case request fields", async () => {
    const captured: Array<{ body: unknown }> = [];

    setOpenRouterHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "ok" } }],
          model: "google/gemini-2.0-flash-exp",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "google/gemini-2.0-flash-exp" },
      options: {
        maxTokens: 256,
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
        topP: 0.9,
      },
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "hi" }]);

    expect(captured[0].body).toMatchObject({
      frequency_penalty: 0.5,
      presence_penalty: 0.5,
      top_p: 0.9,
      max_tokens: 256,
    });
  });

  it("surfaces rate-limit errors clearly", async () => {
    setOpenRouterHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "openai/gpt-4o" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/rate limit/i);
  });

  it("surfaces insufficient-credits (402) errors clearly", async () => {
    setOpenRouterHttpClient(async () => ({
      status: 402,
      headers: {},
      body: { error: { message: "insufficient credits" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "openai/gpt-4o" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(
      /insufficient credits/i,
    );
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setOpenRouterHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "ok" } }],
          model: "openai/gpt-4o",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "openai/gpt-4o" },
      options: { maxRetries: 2 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke([{ role: "user", content: "hi" }]);
    expect(result.text).toBe("ok");
    expect(calls).toBe(3);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

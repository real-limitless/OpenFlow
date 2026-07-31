import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setOpenAiHttpClient,
  type OpenAiModelHandle,
  type OpenAiChatMessage,
  type OpenAiHttpClient,
} from "../../executors/lm-chat-openai";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatOpenAi";

const OPENAI_CRED = {
  apiKey: "sk-test-key",
  organizationId: "org-test",
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
  credentials: Record<string, Record<string, unknown>> = { openAiApi: OPENAI_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): OpenAiModelHandle {
  return out[0][0].json as unknown as OpenAiModelHandle;
}

afterEach(() => setOpenAiHttpClient(null));

describe("batch-queue lmChatOpenAi — @n8n/n8n-nodes-langchain.lmChatOpenAi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("OpenAI Chat Model");
  });

  it("builds a chat-completions handle with model + options", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4.1-mini" },
      responsesApiEnabled: false,
      options: { temperature: 0, maxTokens: 1024, timeout: 120000 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("gpt-4.1-mini");
    expect(handle.responsesApiEnabled).toBe(false);
    expect(handle.options).toMatchObject({ temperature: 0, maxTokens: 1024, timeout: 120000 });
    expect(handle.builtInTools).toEqual({});
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.openai_model }}" },
        options: { temperature: 0.2, maxTokens: 2000 },
      },
      [{ openai_model: "gpt-4o-mini" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("gpt-4o-mini");
  });

  it("accepts a plain string model (non resource-locator)", async () => {
    const out = await runModel({
      model: "gpt-4o",
      options: {},
    });
    expect(getHandle(out).model).toBe("gpt-4o");
  });

  it("builds a responses-api handle with web search built-in tool", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-5-mini" },
      responsesApiEnabled: true,
      builtInTools: {
        webSearch: { searchContextSize: "medium" },
      },
      options: {},
    });

    const handle = getHandle(out);
    expect(handle.responsesApiEnabled).toBe(true);
    expect(handle.builtInTools).toMatchObject({
      webSearch: { searchContextSize: "medium" },
    });
  });

  it("throws when openAiApi credential is missing", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "gpt-4.1-mini" }, options: {} },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "openAiApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel({ model: { __rl: true, mode: "list", value: "gpt-4.1-mini" }, options: {} }, [{}], {
        openAiApi: { apiKey: "" },
      }),
    ).rejects.toThrow(/missing apiKey/);
  });

  it("invoke passes agent tools and parses tool_calls from chat completions", async () => {
    const captured: Array<{ body: unknown }> = [];
    setOpenAiHttpClient(async (opts) => {
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
                    id: "call_abc",
                    type: "function",
                    function: {
                      name: "get_quote",
                      arguments: '{"symbol":"AAPL"}',
                    },
                  },
                ],
              },
            },
          ],
          model: "gpt-4.1-mini",
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4.1-mini" },
      options: { temperature: 0 },
    });
    const handle = getHandle(out);
    const result = await handle.invoke([{ role: "user", content: "Quote AAPL" }], [
      { name: "get_quote", description: "Get quote", schema: { type: "object", properties: {} } },
    ]);

    expect(result.toolCalls).toEqual([
      { id: "call_abc", name: "get_quote", args: { symbol: "AAPL" } },
    ]);
    expect(result.text).toBe("");
    const body = captured[0].body as {
      tools: Array<{ type: string; function: { name: string } }>;
    };
    expect(body.tools).toEqual([
      expect.objectContaining({
        type: "function",
        function: expect.objectContaining({ name: "get_quote" }),
      }),
    ]);
  });

  it("invoke serializes tool role messages with tool_call_id", async () => {
    const captured: Array<{ body: unknown }> = [];
    setOpenAiHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "Final" } }],
          model: "gpt-4.1-mini",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4.1-mini" },
      options: {},
    });
    const handle = getHandle(out);
    await handle.invoke(
      [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "t", arguments: "{}" },
            },
          ],
        },
        { role: "tool", content: "obs", tool_call_id: "call_1" },
      ],
      [{ name: "t", schema: { type: "object" } }],
    );

    const body = captured[0].body as { messages: Array<Record<string, unknown>> };
    expect(body.messages[1]).toMatchObject({
      role: "assistant",
      tool_calls: [expect.objectContaining({ id: "call_1" })],
    });
    expect(body.messages[2]).toEqual({
      role: "tool",
      content: "obs",
      tool_call_id: "call_1",
    });
  });

  it("invoke calls chat completions endpoint with correct body", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setOpenAiHttpClient(async (opts) => {
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
          model: "gpt-4.1-mini",
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4.1-mini" },
      options: { temperature: 0, maxTokens: 1024 },
    });

    const handle = getHandle(out);
    const messages: OpenAiChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello!");
    expect(result.model).toBe("gpt-4.1-mini");
    expect(result.usage).toEqual({
      promptTokens: 5,
      completionTokens: 2,
      totalTokens: 7,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer sk-test-key");
    expect(captured[0].headers["openai-organization"]).toBe("org-test");
    expect(captured[0].body).toMatchObject({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0,
      max_tokens: 1024,
    });
  });

  it("invoke calls responses endpoint with tools when responsesApiEnabled", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];

    setOpenAiHttpClient(async (opts) => {
      captured.push({ url: opts.url, body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          output_text: "Searched!",
          model: "gpt-5-mini",
          usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-5-mini" },
      responsesApiEnabled: true,
      builtInTools: { webSearch: { searchContextSize: "medium" } },
      options: { temperature: 0.5, maxTokens: 500 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke([{ role: "user", content: "search the web" }]);

    expect(result.text).toBe("Searched!");
    expect(captured[0].url).toBe("https://api.openai.com/v1/responses");
    expect(captured[0].body).toMatchObject({
      model: "gpt-5-mini",
      input: [{ role: "user", content: "search the web" }],
      temperature: 0.5,
      max_output_tokens: 500,
      tools: [{ type: "web_search_preview", search_context_size: "medium" }],
    });
  });

  it("surfaces rate-limit errors clearly", async () => {
    setOpenAiHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4.1-mini" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/rate limit/i);
  });

  it("surfaces insufficient-quota errors clearly", async () => {
    setOpenAiHttpClient(async () => ({
      status: 402,
      headers: {},
      body: { error: { code: "insufficient_quota" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4.1-mini" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(
      /insufficient quota/i,
    );
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setOpenAiHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "ok" } }],
          model: "gpt-4.1-mini",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4.1-mini" },
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

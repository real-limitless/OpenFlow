import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import {
  setGroqHttpClient,
  type GroqModelHandle,
  type GroqChatMessage,
  type GroqHttpClient,
} from "../../executors/lm-chat-groq";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatGroq";

const GROQ_CRED = {
  apiKey: "gsk-test-key",
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
  credentials: Record<string, Record<string, unknown>> = { groqApi: GROQ_CRED },
): Promise<INodeExecutionData[][]> {
  const node = { id: "1", name: "N", type: TYPE, typeVersion: 1, position: [0, 0], parameters };
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node as INode, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node as INode);
}

function getHandle(out: INodeExecutionData[][]): GroqModelHandle {
  return out[0][0].json as unknown as GroqModelHandle;
}

afterEach(() => setGroqHttpClient(null));

describe("batch-queue lmChatGroq — @n8n/n8n-nodes-langchain.lmChatGroq", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Groq Chat Model");
  });

  it("builds a handle with model + options", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama-3.3-70b-versatile" },
      options: { temperature: 0.7, maxTokens: 1024 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("llama-3.3-70b-versatile");
    expect(handle.options).toMatchObject({ temperature: 0.7, maxTokens: 1024 });
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.groq_model }}" },
        options: { temperature: 0.2 },
      },
      [{ groq_model: "meta-llama/llama-4-scout-17b-16e-instruct" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("meta-llama/llama-4-scout-17b-16e-instruct");
  });

  it("coerces temperature 0 to 1e-8", async () => {
    const captured: Array<{ body: unknown }> = [];
    setGroqHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "ok" } }],
          model: "llama-3.3-70b-versatile",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama-3.3-70b-versatile" },
      options: { temperature: 0 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke([{ role: "user", content: "hi" }]);
    expect(result.text).toBe("ok");
    const body = captured[0].body as { temperature: number };
    expect(body.temperature).toBe(1e-8);
  });

  it("passes multi-turn messages through", async () => {
    const captured: Array<{ body: unknown }> = [];
    setGroqHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "Summary" } }],
          model: "llama-3.3-70b-versatile",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama-3.3-70b-versatile" },
      options: {},
    });

    const handle = getHandle(out);
    const messages: GroqChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Summarize the meeting." },
    ];
    await handle.invoke(messages);

    const body = captured[0].body as { messages: unknown[] };
    expect(body.messages).toEqual(messages);
  });

  it("throws when groqApi credential is missing", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "llama-3.3-70b-versatile" }, options: {} },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "groqApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "llama-3.3-70b-versatile" }, options: {} },
        [{}],
        { groqApi: { apiKey: "" } },
      ),
    ).rejects.toThrow(/missing apiKey/);
  });

  it("invoke sends correct request shape", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setGroqHttpClient(async (opts) => {
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
          model: "llama-3.3-70b-versatile",
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama-3.3-70b-versatile" },
      options: { temperature: 0.7, maxTokens: 1024 },
    });

    const handle = getHandle(out);
    const messages: GroqChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello!");
    expect(result.model).toBe("llama-3.3-70b-versatile");
    expect(result.usage).toEqual({
      promptTokens: 5,
      completionTokens: 2,
      totalTokens: 7,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer gsk-test-key");
    expect(captured[0].body).toMatchObject({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    });
  });

  it("invoke passes agent tools and parses tool_calls", async () => {
    const captured: Array<{ body: unknown }> = [];
    setGroqHttpClient(async (opts) => {
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
          model: "llama-3.3-70b-versatile",
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama-3.3-70b-versatile" },
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

  it("surfaces rate-limit errors clearly", async () => {
    setGroqHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama-3.3-70b-versatile" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/rate limit/i);
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setGroqHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "ok" } }],
          model: "llama-3.3-70b-versatile",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama-3.3-70b-versatile" },
      options: { maxRetries: 2 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke([{ role: "user", content: "hi" }]);
    expect(result.text).toBe("ok");
    expect(calls).toBe(3);
  });
});

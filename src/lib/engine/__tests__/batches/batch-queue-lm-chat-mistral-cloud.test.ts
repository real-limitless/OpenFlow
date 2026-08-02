import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import {
  setMistralHttpClient,
  type MistralModelHandle,
  type MistralChatMessage,
  type MistralHttpClient,
} from "../../executors/lm-chat-mistral-cloud";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatMistralCloud";

const MISTRAL_CRED = {
  apiKey: "test-api-key",
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
  credentials: Record<string, Record<string, unknown>> = { mistralCloudApi: MISTRAL_CRED },
): Promise<INodeExecutionData[][]> {
  const node = { id: "1", name: "N", type: TYPE, typeVersion: 1, position: [0, 0], parameters };
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node as INode, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node as INode);
}

function getHandle(out: INodeExecutionData[][]): MistralModelHandle {
  return out[0][0].json as unknown as MistralModelHandle;
}

afterEach(() => setMistralHttpClient(null));

describe("batch-queue lmChatMistralCloud — @n8n/n8n-nodes-langchain.lmChatMistralCloud", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mistral Cloud Chat Model");
  });

  it("builds a handle with model + options", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "mistral-large-latest" },
      options: { maxTokens: 1024, temperature: 0.7, topP: 0.9, safeMode: false, randomSeed: 42 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("mistral-large-latest");
    expect(handle.options).toMatchObject({
      maxTokens: 1024,
      temperature: 0.7,
      topP: 0.9,
      safeMode: false,
      randomSeed: 42,
    });
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.mistral_model }}" },
        options: { temperature: 0.2 },
      },
      [{ mistral_model: "open-mistral-nemo" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("open-mistral-nemo");
  });

  it("passes multi-turn messages through", async () => {
    const captured: Array<{ body: unknown }> = [];
    setMistralHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "Summary" } }],
          model: "mistral-large-latest",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "mistral-large-latest" },
      options: {},
    });

    const handle = getHandle(out);
    const messages: MistralChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Summarize the meeting." },
    ];
    await handle.invoke(messages);

    const body = captured[0].body as { messages: unknown[] };
    expect(body.messages).toEqual(messages);
  });

  it("throws when mistralCloudApi credential is missing", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "mistral-large-latest" }, options: {} },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "mistralCloudApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "mistral-large-latest" }, options: {} },
        [{}],
        { mistralCloudApi: { apiKey: "" } },
      ),
    ).rejects.toThrow(/missing apiKey/);
  });

  it("invoke sends correct request shape with all Mistral options mapped", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setMistralHttpClient(async (opts) => {
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
          model: "mistral-large-latest",
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "mistral-large-latest" },
      options: {
        maxTokens: 1024,
        temperature: 0.7,
        topP: 0.9,
        safeMode: true,
        randomSeed: 42,
      },
    });

    const handle = getHandle(out);
    const messages: MistralChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello!");
    expect(result.model).toBe("mistral-large-latest");
    expect(result.usage).toEqual({
      promptTokens: 5,
      completionTokens: 2,
      totalTokens: 7,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.mistral.ai/v1/chat/completions");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer test-api-key");
    expect(captured[0].body).toMatchObject({
      model: "mistral-large-latest",
      messages,
      max_tokens: 1024,
      temperature: 0.7,
      top_p: 0.9,
      safe_prompt: true,
      random_seed: 42,
    });
  });

  it("invoke passes agent tools and parses tool_calls", async () => {
    const captured: Array<{ body: unknown }> = [];
    setMistralHttpClient(async (opts) => {
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
          model: "mistral-large-latest",
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "mistral-large-latest" },
      options: { temperature: 0 },
    });
    const handle = getHandle(out);
    const result = await handle.invoke(
      [{ role: "user", content: "Quote AAPL" }],
      [
        {
          name: "get_quote",
          description: "Get quote",
          schema: { type: "object", properties: {} },
        },
      ],
    );

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
    setMistralHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "mistral-large-latest" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/rate limit/i);
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setMistralHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "ok" } }],
          model: "mistral-large-latest",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "mistral-large-latest" },
      options: { maxRetries: 2 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke([{ role: "user", content: "hi" }]);
    expect(result.text).toBe("ok");
    expect(calls).toBe(3);
  });
});

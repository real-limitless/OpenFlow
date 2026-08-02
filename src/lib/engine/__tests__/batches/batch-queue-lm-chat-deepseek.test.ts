import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setDeepSeekHttpClient,
  type DeepSeekModelHandle,
  type DeepSeekChatMessage,
  type DeepSeekHttpClient,
} from "../../executors/lm-chat-deepseek";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatDeepSeek";

const DEEPSEEK_CRED = {
  apiKey: "sk-test-key",
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
  credentials: Record<string, Record<string, unknown>> = { deepSeekApi: DEEPSEEK_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): DeepSeekModelHandle {
  return out[0][0].json as unknown as DeepSeekModelHandle;
}

afterEach(() => setDeepSeekHttpClient(null));

describe("batch-queue lmChatDeepSeek — @n8n/n8n-nodes-langchain.lmChatDeepSeek", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("DeepSeek Chat Model");
  });

  it("builds a handle with model + options", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "deepseek-v4-pro" },
      options: { maxTokens: 1024, temperature: 0.7, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("deepseek-v4-pro");
    expect(handle.options).toMatchObject({ maxTokens: 1024, temperature: 0.7, topP: 0.9 });
    expect(typeof handle.invoke).toBe("function");
    expect(handle.baseUrl).toBe("https://api.deepseek.com");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.deepseek_model }}" },
        options: { temperature: 0.2 },
      },
      [{ deepseek_model: "deepseek-v4-flash" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("deepseek-v4-flash");
  });

  it("accepts a plain string model (non resource-locator)", async () => {
    const out = await runModel({
      model: "deepseek-v4-pro",
      options: {},
    });
    expect(getHandle(out).model).toBe("deepseek-v4-pro");
  });

  it("throws when deepSeekApi credential is missing", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "deepseek-v4-pro" }, options: {} },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "deepSeekApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel({ model: { __rl: true, mode: "list", value: "deepseek-v4-pro" }, options: {} }, [{}], {
        deepSeekApi: { apiKey: "" },
      }),
    ).rejects.toThrow(/missing apiKey/);
  });

  it("invoke calls chat completions endpoint with correct body", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setDeepSeekHttpClient(async (opts) => {
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
          model: "deepseek-v4-pro",
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "deepseek-v4-pro" },
      options: { temperature: 0.7, maxTokens: 1024 },
    });

    const handle = getHandle(out);
    const messages: DeepSeekChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello!");
    expect(result.model).toBe("deepseek-v4-pro");
    expect(result.usage).toEqual({ promptTokens: 5, completionTokens: 2, totalTokens: 7 });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.deepseek.com/chat/completions");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer sk-test-key");
    expect(captured[0].body).toMatchObject({
      model: "deepseek-v4-pro",
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    });
  });

  it("invoke passes response_format json_object when responseFormat is json", async () => {
    const captured: Array<{ body: unknown }> = [];

    setDeepSeekHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: '{"key":"value"}' } }],
          model: "deepseek-v4-pro",
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "deepseek-v4-pro" },
      options: { responseFormat: "json" },
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "Return JSON" }]);

    expect(captured[0].body).toMatchObject({
      response_format: { type: "json_object" },
    });
  });

  it("multi-turn messages are passed through verbatim", async () => {
    const captured: Array<{ body: unknown }> = [];

    setDeepSeekHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "Summary." } }],
          model: "deepseek-v4-pro",
          usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "deepseek-v4-pro" },
      options: {},
    });

    const handle = getHandle(out);
    const messages: DeepSeekChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Summarize the meeting." },
    ];
    await handle.invoke(messages);

    const body = captured[0].body as { messages: DeepSeekChatMessage[] };
    expect(body.messages).toEqual(messages);
  });

  it("surfaces rate-limit errors clearly", async () => {
    setDeepSeekHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "deepseek-v4-pro" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/rate limit/i);
  });

  it("surfaces insufficient-balance errors clearly", async () => {
    setDeepSeekHttpClient(async () => ({
      status: 402,
      headers: {},
      body: { error: { code: "insufficient_balance" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "deepseek-v4-pro" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/insufficient balance/i);
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setDeepSeekHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "ok" } }],
          model: "deepseek-v4-pro",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "deepseek-v4-pro" },
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

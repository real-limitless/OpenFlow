import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setXAiGrokHttpClient,
  type XAiGrokModelHandle,
  type XAiGrokChatMessage,
  type XAiGrokHttpClient,
} from "../../executors/lm-chat-xai-grok";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatXAiGrok";

const XAI_CRED = {
  apiKey: "xai-test-key",
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
  credentials: Record<string, Record<string, unknown>> = { xAiApi: XAI_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): XAiGrokModelHandle {
  return out[0][0].json as unknown as XAiGrokModelHandle;
}

afterEach(() => setXAiGrokHttpClient(null));

describe("batch-queue lmChatXAiGrok — @n8n/n8n-nodes-langchain.lmChatXAiGrok", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("xAI Grok Chat Model");
  });

  it("builds a handle with model + options", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "grok-4.5" },
      options: { maxTokens: 1024, temperature: 0.7, topP: 0.9 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("grok-4.5");
    expect(handle.options).toMatchObject({ maxTokens: 1024, temperature: 0.7, topP: 0.9 });
    expect(typeof handle.invoke).toBe("function");
    expect(handle.baseUrl).toBe("https://api.x.ai/v1");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.xai_model }}" },
        options: { temperature: 0.2 },
      },
      [{ xai_model: "grok-4.5" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("grok-4.5");
  });

  it("accepts a plain string model (non resource-locator)", async () => {
    const out = await runModel({
      model: "grok-4.5",
      options: {},
    });
    expect(getHandle(out).model).toBe("grok-4.5");
  });

  it("throws when xAiApi credential is missing", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "grok-4.5" }, options: {} },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "xAiApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel({ model: { __rl: true, mode: "list", value: "grok-4.5" }, options: {} }, [{}], {
        xAiApi: { apiKey: "" },
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

    setXAiGrokHttpClient(async (opts) => {
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
          model: "grok-4.5",
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "grok-4.5" },
      options: { temperature: 0.7, maxTokens: 1024 },
    });

    const handle = getHandle(out);
    const messages: XAiGrokChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello!");
    expect(result.model).toBe("grok-4.5");
    expect(result.usage).toEqual({ promptTokens: 5, completionTokens: 2, totalTokens: 7 });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.x.ai/v1/chat/completions");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer xai-test-key");
    expect(captured[0].body).toMatchObject({
      model: "grok-4.5",
      messages,
      temperature: 0.7,
      max_completion_tokens: 1024,
    });
  });

  it("invoke passes response_format json_object when responseFormat is json", async () => {
    const captured: Array<{ body: unknown }> = [];

    setXAiGrokHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: '{"key":"value"}' } }],
          model: "grok-4.5",
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "grok-4.5" },
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

    setXAiGrokHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "Summary." } }],
          model: "grok-4.5",
          usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "grok-4.5" },
      options: {},
    });

    const handle = getHandle(out);
    const messages: XAiGrokChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Summarize the meeting." },
    ];
    await handle.invoke(messages);

    const body = captured[0].body as { messages: XAiGrokChatMessage[] };
    expect(body.messages).toEqual(messages);
  });

  it("surfaces rate-limit errors clearly", async () => {
    setXAiGrokHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "grok-4.5" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/rate limit/i);
  });

  it("surfaces auth errors clearly", async () => {
    setXAiGrokHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { error: { message: "Invalid API key" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "grok-4.5" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/authentication error/i);
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setXAiGrokHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "ok" } }],
          model: "grok-4.5",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "grok-4.5" },
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

import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setMoonshotHttpClient,
  type MoonshotModelHandle,
  type MoonshotChatMessage,
  type MoonshotHttpClient,
} from "../../executors/lm-chat-moonshot";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatMoonshot";

const MOONSHOT_CRED = {
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
  credentials: Record<string, Record<string, unknown>> = { moonshotApi: MOONSHOT_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): MoonshotModelHandle {
  return out[0][0].json as unknown as MoonshotModelHandle;
}

afterEach(() => setMoonshotHttpClient(null));

describe("batch-queue lmChatMoonshot — @n8n/n8n-nodes-langchain.lmChatMoonshot", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Moonshot Kimi Chat Model");
  });

  it("builds a handle with model + options", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "kimi-k2.5" },
      options: { maxTokens: 2048, temperature: 0.7, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("kimi-k2.5");
    expect(handle.options).toMatchObject({ maxTokens: 2048, temperature: 0.7, topP: 0.9 });
    expect(typeof handle.invoke).toBe("function");
    expect(handle.baseUrl).toBe("https://api.moonshot.ai/v1");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.moonshot_model }}" },
        options: { temperature: 0.2 },
      },
      [{ moonshot_model: "kimi-k2.6" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("kimi-k2.6");
  });

  it("accepts a plain string model (non resource-locator)", async () => {
    const out = await runModel({
      model: "kimi-k2.5",
      options: {},
    });
    expect(getHandle(out).model).toBe("kimi-k2.5");
  });

  it("throws when moonshotApi credential is missing", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "kimi-k2.5" }, options: {} },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "moonshotApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel({ model: { __rl: true, mode: "list", value: "kimi-k2.5" }, options: {} }, [{}], {
        moonshotApi: { apiKey: "" },
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

    setMoonshotHttpClient(async (opts) => {
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
          choices: [{ message: { content: "Hello from Kimi!" } }],
          model: "kimi-k2.5",
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "kimi-k2.5" },
      options: { temperature: 0.7, maxTokens: 2048 },
    });

    const handle = getHandle(out);
    const messages: MoonshotChatMessage[] = [
      { role: "system", content: "You are Kimi." },
      { role: "user", content: "Hi" },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello from Kimi!");
    expect(result.model).toBe("kimi-k2.5");
    expect(result.usage).toEqual({ promptTokens: 5, completionTokens: 3, totalTokens: 8 });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.moonshot.ai/v1/chat/completions");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer sk-test-key");
    expect(captured[0].body).toMatchObject({
      model: "kimi-k2.5",
      messages,
      temperature: 0.7,
      max_completion_tokens: 2048,
    });
  });

  it("invoke sends max_completion_tokens only when not -1", async () => {
    const captured: Array<{ body: unknown }> = [];

    setMoonshotHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "ok" } }],
          model: "kimi-k2.5",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "kimi-k2.5" },
      options: { maxTokens: -1 },
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "hi" }]);

    const body = captured[0].body as Record<string, unknown>;
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it("invoke sends response_format json_object when responseFormat is json", async () => {
    const captured: Array<{ body: unknown }> = [];

    setMoonshotHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: '{"key":"value"}' } }],
          model: "kimi-k2.5",
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "kimi-k2.5" },
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

    setMoonshotHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "Summary." } }],
          model: "kimi-k2.5",
          usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "kimi-k2.5" },
      options: {},
    });

    const handle = getHandle(out);
    const messages: MoonshotChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Summarize the meeting." },
    ];
    await handle.invoke(messages);

    const body = captured[0].body as { messages: MoonshotChatMessage[] };
    expect(body.messages).toEqual(messages);
  });

  it("surfaces rate-limit errors clearly", async () => {
    setMoonshotHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "kimi-k2.5" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/rate limit/i);
  });

  it("surfaces authentication errors clearly", async () => {
    setMoonshotHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { error: { message: "Invalid API key" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "kimi-k2.5" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/authentication/i);
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setMoonshotHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "ok" } }],
          model: "kimi-k2.5",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "kimi-k2.5" },
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

import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setOpenAiHttpClient,
  type OpenAiTextModelHandle,
  type OpenAiTextCompletionResult,
  type OpenAiHttpClient,
} from "../../executors/lm-openai";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmOpenAi";

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

function getHandle(out: INodeExecutionData[][]): OpenAiTextModelHandle {
  return out[0][0].json as unknown as OpenAiTextModelHandle;
}

afterEach(() => setOpenAiHttpClient(null));

describe("batch-queue lmOpenAi — @n8n/n8n-nodes-langchain.lmOpenAi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("OpenAI Model");
  });

  it("builds a text-completions handle with model + options", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-3.5-turbo-instruct" },
      options: { temperature: 0.7, maxTokens: 256, timeout: 60000 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("gpt-3.5-turbo-instruct");
    expect(handle.options).toMatchObject({ temperature: 0.7, maxTokens: 256, timeout: 60000 });
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.llm_model }}" },
        options: {},
      },
      [{ llm_model: "gpt-3.5-turbo-instruct" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("gpt-3.5-turbo-instruct");
  });

  it("accepts a plain string model (non resource-locator)", async () => {
    const out = await runModel({
      model: "gpt-3.5-turbo-instruct",
      options: {},
    });
    expect(getHandle(out).model).toBe("gpt-3.5-turbo-instruct");
  });

  it("throws when openAiApi credential is missing", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "gpt-3.5-turbo-instruct" }, options: {} },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "openAiApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "gpt-3.5-turbo-instruct" }, options: {} },
        [{}],
        { openAiApi: { apiKey: "" } },
      ),
    ).rejects.toThrow(/missing apiKey/);
  });

  it("invoke calls completions endpoint with correct body", async () => {
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
          id: "cmpl-xxx",
          object: "text_completion",
          choices: [{ text: "The answer is 42.", index: 0, finish_reason: "stop" }],
          model: "gpt-3.5-turbo-instruct",
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-3.5-turbo-instruct" },
      options: { temperature: 0.7, maxTokens: 256 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke("What is the answer?");

    expect(result.text).toBe("The answer is 42.");
    expect(result.model).toBe("gpt-3.5-turbo-instruct");
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.openai.com/v1/completions");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer sk-test-key");
    expect(captured[0].headers["openai-organization"]).toBe("org-test");
    expect(captured[0].body).toMatchObject({
      model: "gpt-3.5-turbo-instruct",
      prompt: "What is the answer?",
      temperature: 0.7,
      max_tokens: 256,
    });
  });

  it("surfaces rate-limit errors clearly", async () => {
    setOpenAiHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-3.5-turbo-instruct" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke("hi")).rejects.toThrow(/rate limit/i);
  });

  it("surfaces insufficient-quota errors clearly", async () => {
    setOpenAiHttpClient(async () => ({
      status: 402,
      headers: {},
      body: { error: { code: "insufficient_quota" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-3.5-turbo-instruct" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke("hi")).rejects.toThrow(/insufficient quota/i);
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
          choices: [{ text: "ok" }],
          model: "gpt-3.5-turbo-instruct",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-3.5-turbo-instruct" },
      options: { maxRetries: 2 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke("hi");
    expect(result.text).toBe("ok");
    expect(calls).toBe(3);
  });

  it("uses custom base URL from options", async () => {
    const captured: Array<{ url: string }> = [];
    setOpenAiHttpClient(async (opts) => {
      captured.push({ url: opts.url });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ text: "ok" }],
          model: "my-custom-model",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "my-custom-model" },
      options: { baseURL: "https://custom-endpoint.example.com/v1", timeout: 120000 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke("test");
    expect(result.text).toBe("ok");
    expect(captured[0].url).toBe("https://custom-endpoint.example.com/v1/completions");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
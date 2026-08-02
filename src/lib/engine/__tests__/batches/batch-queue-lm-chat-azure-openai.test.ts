import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setAzureOpenAiHttpClient,
  type AzureOpenAiModelHandle,
  type AzureOpenAiChatMessage,
  type AzureOpenAiHttpClient,
} from "../../executors/lm-chat-azure-openai";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatAzureOpenAi";

const AZURE_CRED = {
  apiKey: "sk-azure-test",
  resourceName: "my-openai-resource",
  apiVersion: "2024-06-01",
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
  credentials: Record<string, Record<string, unknown>> = { azureOpenAiApi: AZURE_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): AzureOpenAiModelHandle {
  return out[0][0].json as unknown as AzureOpenAiModelHandle;
}

afterEach(() => setAzureOpenAiHttpClient(null));

describe("batch-queue lmChatAzureOpenAi — @n8n/n8n-nodes-langchain.lmChatAzureOpenAi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Azure OpenAI Chat Model");
  });

  it("builds a handle with model + options from resource locator", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4o" },
      options: { maxTokens: 1024, temperature: 0.7, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("gpt-4o");
    expect(handle.options).toMatchObject({ maxTokens: 1024, temperature: 0.7, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0 });
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves deployment id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.azure_deployment }}" },
        options: {},
      },
      [{ azure_deployment: "gpt-4o-mini" }],
    );

    expect(getHandle(out).model).toBe("gpt-4o-mini");
  });

  it("accepts a plain string model (non resource-locator)", async () => {
    const out = await runModel({
      model: "gpt-35-turbo",
      options: {},
    });
    expect(getHandle(out).model).toBe("gpt-35-turbo");
  });

  it("throws when azureOpenAiApi credential is missing", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "gpt-4o" }, options: {} },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "azureOpenAiApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel({ model: "gpt-4o", options: {} }, [{}], {
        azureOpenAiApi: { apiKey: "", resourceName: "r", apiVersion: "2024-06-01" },
      }),
    ).rejects.toThrow(/missing apiKey/);
  });

  it("throws when resourceName is empty", async () => {
    await expect(
      runModel({ model: "gpt-4o", options: {} }, [{}], {
        azureOpenAiApi: { apiKey: "sk-test", resourceName: "", apiVersion: "2024-06-01" },
      }),
    ).rejects.toThrow(/missing resourceName/);
  });

  it("throws when apiVersion is empty", async () => {
    await expect(
      runModel({ model: "gpt-4o", options: {} }, [{}], {
        azureOpenAiApi: { apiKey: "sk-test", resourceName: "r", apiVersion: "" },
      }),
    ).rejects.toThrow(/missing apiVersion/);
  });

  it("invoke sends correct endpoint URL and body with api-key header", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setAzureOpenAiHttpClient(async (opts) => {
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
          choices: [{ message: { content: "Hello from Azure!" } }],
          model: "gpt-4o",
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4o" },
      options: { temperature: 0.7, maxTokens: 1024 },
    });

    const handle = getHandle(out);
    const messages: AzureOpenAiChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello from Azure!");
    expect(result.model).toBe("gpt-4o");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(
      "https://my-openai-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-06-01",
    );
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers["api-key"]).toBe("sk-azure-test");
    expect(captured[0].body).toMatchObject({
      model: "gpt-4o",
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    });
  });

  it("sets response_format json_object when responseFormat is json", async () => {
    const captured: Array<{ body: unknown }> = [];

    setAzureOpenAiHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: '{"ok":true}' } }],
          model: "gpt-4o",
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4o" },
      options: { responseFormat: "json" },
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "Say JSON" }]);

    const body = captured[0].body as { response_format?: { type: string } };
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("surfaces rate-limit errors clearly", async () => {
    setAzureOpenAiHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit exceeded" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4o" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/rate limit/i);
  });

  it("surfaces unauthorized errors clearly", async () => {
    setAzureOpenAiHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { error: { message: "Unauthorized" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4o" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/unauthorized/i);
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setAzureOpenAiHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "ok" } }],
          model: "gpt-4o",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gpt-4o" },
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

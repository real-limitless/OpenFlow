import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setOllamaHttpClient,
  type OllamaModelHandle,
  type OllamaChatMessage,
} from "../../executors/lm-chat-ollama";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatOllama";

const OLLAMA_CRED = {
  baseUrl: "http://localhost:11434",
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
  credentials: Record<string, Record<string, unknown>> = { ollamaApi: OLLAMA_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): OllamaModelHandle {
  return out[0][0].json as unknown as OllamaModelHandle;
}

afterEach(() => setOllamaHttpClient(null));

describe("batch-queue lmChatOllama — @n8n/n8n-nodes-langchain.lmChatOllama", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Ollama Chat Model");
  });

  it("builds a model handle with model + options (wire shape)", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama3.2" },
      options: { temperature: 0, topK: 40, topP: 0.9 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("llama3.2");
    expect(handle.options).toMatchObject({ temperature: 0, topK: 40, topP: 0.9 });
    expect(handle.baseUrl).toBe("http://localhost:11434");
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.ollama_model }}" },
        options: { temperature: 0.2, topP: 0.95 },
      },
      [{ ollama_model: "llama3:70b" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("llama3:70b");
  });

  it("accepts a plain string model (non resource-locator)", async () => {
    const out = await runModel({
      model: "llama2-uncensored",
      options: { topK: 5 },
    });
    expect(getHandle(out).model).toBe("llama2-uncensored");
  });

  it("throws when model id is missing", async () => {
    await expect(
      runModel({ model: { __rl: true, mode: "list", value: "" }, options: {} }),
    ).rejects.toThrow(/model id is required/i);
  });

  it("invoke calls /api/chat with model + options.temperature/top_k/top_p, no auth header (local)", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setOllamaHttpClient(async (opts) => {
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
          model: "llama3.2",
          message: { role: "assistant", content: "Hello!" },
          done: true,
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama3.2" },
      options: { temperature: 0, topK: 40, topP: 0.9 },
    });

    const handle = getHandle(out);
    const messages: OllamaChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello!");
    expect(result.model).toBe("llama3.2");
    expect(result.done).toBe(true);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("http://localhost:11434/api/chat");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers["content-type"]).toBe("application/json");
    expect(captured[0].headers["authorization"]).toBeUndefined();
    expect(captured[0].body).toMatchObject({
      model: "llama3.2",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hi" },
      ],
      options: { temperature: 0, top_k: 40, top_p: 0.9 },
    });
  });

  it("invoke sends Authorization Bearer header for remote authenticated Ollama", async () => {
    const captured: Array<{
      url: string;
      headers: Record<string, string>;
    }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({ url: opts.url, headers: opts.headers ?? {} });
      return {
        status: 200,
        headers: {},
        body: {
          model: "llama3.2",
          message: { role: "assistant", content: "ok" },
          done: true,
        },
      };
    });

    const out = await runModel(
      {
        model: { __rl: true, mode: "list", value: "llama3.2" },
        options: { temperature: 0.7 },
      },
      [{}],
      {
        ollamaApi: {
          baseUrl: "https://ollama-proxy.example.com",
          apiKey: "sk-remote-key",
        },
      },
    );

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "hi" }]);

    expect(captured[0].url).toBe("https://ollama-proxy.example.com/api/chat");
    expect(captured[0].headers["authorization"]).toBe("Bearer sk-remote-key");
  });

  it("invoke sends both top_k and top_p when set", async () => {
    const captured: Array<{ body: unknown }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          model: "llama2-uncensored",
          message: { role: "assistant", content: "ok" },
          done: true,
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama2-uncensored" },
      options: { topK: 5, topP: 0.9 },
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "hi" }]);

    expect(captured[0].body).toMatchObject({
      options: { top_k: 5, top_p: 0.9 },
    });
  });

  it("invoke omits options object when no sampling options are set", async () => {
    const captured: Array<{ body: unknown }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          model: "llama3.2",
          message: { role: "assistant", content: "ok" },
          done: true,
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama3.2" },
      options: {},
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "hi" }]);

    const body = captured[0].body as Record<string, unknown>;
    expect(body.options).toBeUndefined();
    expect(body).toMatchObject({ model: "llama3.2" });
  });

  it("invoke fails when ollamaApi credential is missing (fail on invoke)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "list", value: "llama3.2" },
        options: {},
      },
      [{}],
      {},
    );

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(
      /credential "ollamaApi" is required/i,
    );
  });

  it("uses default base URL when credential baseUrl is empty", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "list", value: "llama3.2" },
        options: {},
      },
      [{}],
      { ollamaApi: { baseUrl: "" } },
    );

    const handle = getHandle(out);
    expect(handle.baseUrl).toBe("http://localhost:11434");
  });

  it("surfaces 404 model-not-found errors clearly", async () => {
    setOllamaHttpClient(async () => ({
      status: 404,
      headers: {},
      body: { error: "model not found" },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "no-such-model" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(
      /not found/i,
    );
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setOllamaHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          model: "llama3.2",
          message: { role: "assistant", content: "ok" },
          done: true,
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama3.2" },
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
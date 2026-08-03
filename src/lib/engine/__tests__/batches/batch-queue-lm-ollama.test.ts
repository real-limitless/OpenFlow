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
} from "../../executors/lm-ollama";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmOllama";

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

describe("batch-queue lmOllama — @n8n/n8n-nodes-langchain.lmOllama", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Ollama Model");
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

  it("invoke calls /api/generate with model + prompt + options, no auth header (local)", async () => {
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
          response: "Paris is the capital of France.",
          done: true,
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama3.2" },
      options: { temperature: 0.7, numPredict: 100 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke("What is the capital of France?");

    expect(result.response).toBe("Paris is the capital of France.");
    expect(result.model).toBe("llama3.2");
    expect(result.done).toBe(true);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("http://localhost:11434/api/generate");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers["content-type"]).toBe("application/json");
    expect(captured[0].headers["authorization"]).toBeUndefined();
    expect(captured[0].body).toMatchObject({
      model: "llama3.2",
      prompt: "What is the capital of France?",
      stream: false,
      options: { temperature: 0.7, num_predict: 100 },
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
          response: "ok",
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
    await handle.invoke("hi");

    expect(captured[0].url).toBe("https://ollama-proxy.example.com/api/generate");
    expect(captured[0].headers["authorization"]).toBe("Bearer sk-remote-key");
  });

  it("invoke sends format: json when format option is set to json", async () => {
    const captured: Array<{ body: unknown }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          model: "llama3.2",
          response: '{"answer": "Paris"}',
          done: true,
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama3.2" },
      options: { format: "json", temperature: 0.3 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke("What is the capital of France?");

    expect(result.response).toBe('{"answer": "Paris"}');
    const body = captured[0].body as Record<string, unknown>;
    expect(body.format).toBe("json");
  });

  it("invoke sends system message when provided in options", async () => {
    const captured: Array<{ body: unknown }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: { model: "llama3.2", response: "ok", done: true },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama3.2" },
      options: { system: "You are a helpful assistant." },
    });

    const handle = getHandle(out);
    await handle.invoke("hi");

    const body = captured[0].body as Record<string, unknown>;
    expect(body.system).toBe("You are a helpful assistant.");
  });

  it("invoke sends keep_alive when provided", async () => {
    const captured: Array<{ body: unknown }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: { model: "llama3.2", response: "ok", done: true },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama3.2" },
      options: { keepAlive: "1h" },
    });

    const handle = getHandle(out);
    await handle.invoke("hi");

    const body = captured[0].body as Record<string, unknown>;
    expect(body.keep_alive).toBe("1h");
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
    await expect(handle.invoke("hi")).rejects.toThrow(
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
    await expect(handle.invoke("hi")).rejects.toThrow(/not found/i);
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
          response: "ok",
          done: true,
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama3.2" },
      options: { maxRetries: 2 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke("hi");
    expect(result.response).toBe("ok");
    expect(calls).toBe(3);
  });

  it("maps all option keys to Ollama snake_case keys", async () => {
    const captured: Array<{ body: unknown }> = [];

    setOllamaHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: { model: "llama3.2", response: "ok", done: true },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "llama3.2" },
      options: {
        temperature: 0.5,
        topK: 40,
        topP: 0.9,
        frequencyPenalty: 0.2,
        presencePenalty: 0.3,
        repeatPenalty: 1.1,
        numPredict: 200,
        numCtx: 4096,
        numBatch: 256,
        numThread: 4,
        numGpu: 1,
        mainGpu: 0,
        lowVram: false,
        useMLock: false,
        useMMap: true,
        vocabOnly: false,
        penalizeNewline: false,
        think: true,
        seed: 42,
        stop: "\n",
      },
    });

    const handle = getHandle(out);
    await handle.invoke("hi");

    expect(captured[0].body).toMatchObject({
      options: {
        temperature: 0.5,
        top_k: 40,
        top_p: 0.9,
        frequency_penalty: 0.2,
        presence_penalty: 0.3,
        repeat_penalty: 1.1,
        num_predict: 200,
        num_ctx: 4096,
        num_batch: 256,
        num_thread: 4,
        num_gpu: 1,
        main_gpu: 0,
        low_vram: false,
        use_mlock: false,
        use_mmap: true,
        vocab_only: false,
        penalize_newline: false,
        think: true,
        seed: 42,
        stop: "\n",
      },
    });
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

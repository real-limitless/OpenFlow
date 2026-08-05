import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setHuggingFaceInferenceHttpClient,
  type HuggingFaceModelHandle,
} from "../../executors/lmOpenHuggingFaceInference";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmOpenHuggingFaceInference";
const HF_CRED = { huggingFaceApi: { apiKey: "hf_test123" } };

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
  credentials: Record<string, Record<string, unknown>> = HF_CRED,
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): HuggingFaceModelHandle {
  return out[0][0].json as unknown as HuggingFaceModelHandle;
}

afterEach(() => setHuggingFaceInferenceHttpClient(null));

describe("batch-queue lmOpenHuggingFaceInference — @n8n/n8n-nodes-langchain.lmOpenHuggingFaceInference", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Hugging Face Inference Model");
  });

  it("builds a model handle with model + options (wire shape)", async () => {
    const out = await runModel({
      model: "gpt2",
      options: { maxTokens: 50, temperature: 0.7 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("gpt2");
    expect(handle.options).toMatchObject({ maxTokens: 50, temperature: 0.7 });
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: "={{ $json.hf_model }}",
        options: { maxTokens: 50, temperature: 0.7 },
      },
      [{ hf_model: "meta-llama/Llama-2-7b" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("meta-llama/Llama-2-7b");
  });

  it("throws when model id is missing", async () => {
    await expect(runModel({ model: "", options: {} })).rejects.toThrow(
      /model id is required/i,
    );
  });

  it("throws when credential is missing", async () => {
    await expect(runModel({ model: "gpt2", options: {} }, [{}], {})).rejects.toThrow(
      /credential "huggingFaceApi"/i,
    );
  });

  it("throws when apiKey is empty in credential", async () => {
    await expect(
      runModel({ model: "gpt2", options: {} }, [{}], {
        huggingFaceApi: { apiKey: "" },
      }),
    ).rejects.toThrow(/missing apiKey/i);
  });

  it("invoke calls the HuggingFace Inference API with correct body", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setHuggingFaceInferenceHttpClient(async (opts) => {
      captured.push({
        url: opts.url,
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: opts.body,
      });
      return {
        status: 200,
        headers: {},
        body: [{ generated_text: "Hello from Hugging Face!" }],
      };
    });

    const out = await runModel({
      model: "gpt2",
      options: { maxTokens: 50, temperature: 0.7 },
    });

    const handle = getHandle(out);
    const messages = [{ role: "user", content: "Hello" }];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello from Hugging Face!");
    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api-inference.huggingface.co/models/gpt2");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer hf_test123");
    expect(captured[0].body).toMatchObject({
      inputs: "User: Hello",
      parameters: { max_new_tokens: 50, temperature: 0.7 },
    });
  });

  it("invoke sends request to custom inference endpoint when set", async () => {
    const captured: Array<{ url: string }> = [];

    setHuggingFaceInferenceHttpClient(async (opts) => {
      captured.push({ url: opts.url });
      return {
        status: 200,
        headers: {},
        body: [{ generated_text: "ok" }],
      };
    });

    const out = await runModel({
      model: "my-org/my-model",
      options: {
        customInferenceEndpoint: "https://my-custom-endpoint.example.com/v1/models/my-model",
        maxTokens: 100,
      },
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "hi" }]);

    expect(captured[0].url).toBe(
      "https://my-custom-endpoint.example.com/v1/models/my-model",
    );
  });

  it("invoke sends all generation options as parameters", async () => {
    const captured: Array<{ body: unknown }> = [];

    setHuggingFaceInferenceHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: [{ generated_text: "ok" }],
      };
    });

    const out = await runModel({
      model: "gpt2",
      options: {
        temperature: 0.1,
        topP: 0.9,
        topK: 40,
        frequencyPenalty: 0.5,
        presencePenalty: 0.3,
        maxTokens: 30,
      },
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "test" }]);

    const body = captured[0].body as Record<string, unknown>;
    expect(body.parameters).toMatchObject({
      temperature: 0.1,
      top_p: 0.9,
      top_k: 40,
      frequency_penalty: 0.5,
      repetition_penalty: 0.3,
      max_new_tokens: 30,
    });
  });

  it("invoke omits parameters when no options are set", async () => {
    const captured: Array<{ body: unknown }> = [];

    setHuggingFaceInferenceHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: [{ generated_text: "ok" }],
      };
    });

    const out = await runModel({
      model: "gpt2",
      options: {},
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", content: "test" }]);

    const body = captured[0].body as Record<string, unknown>;
    expect(body.parameters).toBeUndefined();
    expect(body.inputs).toBe("User: test");
  });

  it("surfaces 401/403 as auth errors", async () => {
    setHuggingFaceInferenceHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { error: "unauthorized" },
    }));

    const out = await runModel({ model: "gpt2", options: {} });
    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(
      /authentication/i,
    );
  });

  it("surfaces 404 as model-not-found errors", async () => {
    setHuggingFaceInferenceHttpClient(async () => ({
      status: 404,
      headers: {},
      body: { error: "not found" },
    }));

    const out = await runModel({ model: "no-such-model", options: {} });
    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(
      /model not found/i,
    );
  });

  it("retries on 429 up to 2 times", async () => {
    let calls = 0;
    setHuggingFaceInferenceHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: [{ generated_text: "ok" }],
      };
    });

    const out = await runModel({ model: "gpt2", options: {} });
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

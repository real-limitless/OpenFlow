import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setEmbeddingsHuggingFaceInferenceHttpClient,
  type EmbeddingsHuggingFaceInferenceHandle,
} from "../../executors/embeddings-huggingface-inference";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.embeddingsHuggingFaceInference";

const HF_CRED = {
  apiKey: "hf_test-key",
};

const DEFAULT_MODEL = "sentence-transformers/distilbert-base-nli-mean-tokens";

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
  credentials: Record<string, Record<string, unknown>> = {
    huggingFaceApi: HF_CRED,
  },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): EmbeddingsHuggingFaceInferenceHandle {
  return out[0][0].json as unknown as EmbeddingsHuggingFaceInferenceHandle;
}

function fakeVec(dim: number, seed: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < dim; i++) {
    v.push((seed + i) * 0.001);
  }
  return v;
}

afterEach(() => setEmbeddingsHuggingFaceInferenceHttpClient(null));

describe("batch-queue embeddingsHuggingFaceInference — @n8n/n8n-nodes-langchain.embeddingsHuggingFaceInference", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Embeddings HuggingFace Inference");
  });

  it("builds an embeddings handle with model + defaults", async () => {
    const out = await runModel({});
    const handle = getHandle(out);

    expect(handle.type).toBe(TYPE);
    expect(handle.modelName).toBe(DEFAULT_MODEL);
    expect(handle.endpointUrl).toBe("");
    expect(handle.provider).toBe("auto");
    expect(typeof handle.embedQuery).toBe("function");
    expect(typeof handle.embedDocuments).toBe("function");
  });

  it("resolves modelName from expression against first item (sub-node rule)", async () => {
    const out = await runModel({ modelName: "={{ $json.customModel }}" }, [
      { customModel: "thenlper/gte-large" },
    ]);
    expect(getHandle(out).modelName).toBe("thenlper/gte-large");
  });

  it("throws when huggingFaceApi credential is missing", async () => {
    await expect(runModel({}, [{}], {})).rejects.toThrow(/credential "huggingFaceApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(runModel({}, [{}], { huggingFaceApi: { apiKey: "" } })).rejects.toThrow(
      /missing apiKey/,
    );
  });

  it("embedDocuments uses classic API and returns vectors", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setEmbeddingsHuggingFaceInferenceHttpClient(async (opts) => {
      captured.push({
        url: opts.url,
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: opts.body,
      });
      return { status: 200, headers: {}, body: [fakeVec(768, 1), fakeVec(768, 2)] };
    });

    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments(["Hello world", "OpenFlow is a workflow engine"]);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(768);
    expect(vectors[1]).toHaveLength(768);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(
      "https://api-inference.huggingface.co/models/sentence-transformers/distilbert-base-nli-mean-tokens",
    );
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer hf_test-key");
    expect(captured[0].body).toEqual(["Hello world", "OpenFlow is a workflow engine"]);
  });

  it("embedQuery returns a single vector", async () => {
    setEmbeddingsHuggingFaceInferenceHttpClient(async () => ({
      status: 200,
      headers: {},
      body: [fakeVec(768, 7)],
    }));

    const out = await runModel({});
    const handle = getHandle(out);
    const vec = await handle.embedQuery("Hello world");

    expect(vec).toHaveLength(768);
    expect(vec[0]).toBeCloseTo(0.007, 3);
  });

  it("uses Inference Providers routing when non-default provider is set", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];

    setEmbeddingsHuggingFaceInferenceHttpClient(async (opts) => {
      captured.push({ url: opts.url, body: opts.body });
      return { status: 200, headers: {}, body: [fakeVec(1024, 1)] };
    });

    const out = await runModel({
      modelName: "intfloat/multilingual-e5-large-instruct",
      options: { provider: "together" },
    });
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments(["Single query"]);

    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toHaveLength(1024);

    expect(captured[0].url).toBe("https://router.huggingface.co/v1/feature-extraction");
    const body = captured[0].body as Record<string, unknown>;
    expect(body.model).toBe("intfloat/multilingual-e5-large-instruct");
    expect(body.inputs).toBe("Single query");
    expect(body.provider).toBe("together");
  });

  it("uses custom endpoint URL when endpointUrl is set", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];

    setEmbeddingsHuggingFaceInferenceHttpClient(async (opts) => {
      captured.push({ url: opts.url, body: opts.body });
      return { status: 200, headers: {}, body: [fakeVec(384, 1)] };
    });

    const out = await runModel({
      modelName: "ignored-when-endpoint-is-set",
      options: { endpointUrl: "https://xyz.us-east-1.aws.endpoints.huggingface.cloud/text-embedding" },
    });
    const handle = getHandle(out);
    await handle.embedDocuments(["test"]);

    expect(captured[0].url).toBe(
      "https://xyz.us-east-1.aws.endpoints.huggingface.cloud/text-embedding",
    );
  });

  it("model dimensionality varies by model", async () => {
    setEmbeddingsHuggingFaceInferenceHttpClient(async () => ({
      status: 200,
      headers: {},
      body: [fakeVec(1024, 1)],
    }));

    const out = await runModel({ modelName: "thenlper/gte-large" });
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments(["test"]);

    expect(vectors[0]).toHaveLength(1024);
  });

  it("empty input array returns empty vector list", async () => {
    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments([]);

    expect(vectors).toEqual([]);
  });

  it("surfaces 401 authentication errors clearly", async () => {
    setEmbeddingsHuggingFaceInferenceHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { error: "Invalid API key" },
    }));

    const out = await runModel({ modelName: DEFAULT_MODEL });
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/authentication failed/i);
  });

  it("surfaces 404 model not found errors clearly", async () => {
    setEmbeddingsHuggingFaceInferenceHttpClient(async () => ({
      status: 404,
      headers: {},
      body: { error: "Model not found" },
    }));

    const out = await runModel({ modelName: "nonexistent/model" });
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/model not found/i);
  });

  it("surfaces 429 rate-limit errors clearly", async () => {
    setEmbeddingsHuggingFaceInferenceHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: "Rate limit" },
    }));

    const out = await runModel({});
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/rate limit/i);
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setEmbeddingsMistralCloudHttpClient,
  type EmbeddingsMistralCloudHandle,
} from "../../executors/embeddings-mistral-cloud";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.embeddingsMistralCloud";

const MISTRAL_CRED = {
  apiKey: "sk-test-mistral-key",
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
  credentials: Record<string, Record<string, unknown>> = {
    mistralCloudApi: MISTRAL_CRED,
  },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): EmbeddingsMistralCloudHandle {
  return out[0][0].json as unknown as EmbeddingsMistralCloudHandle;
}

function fakeVec(dim: number, seed: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < dim; i++) {
    v.push((seed + i) * 0.001);
  }
  return v;
}

function embeddingsResponse(vectors: number[][]) {
  return {
    status: 200,
    headers: {},
    body: {
      data: vectors.map((embedding, i) => ({ index: i, object: "embedding", embedding })),
      model: "mistral-embed",
      usage: { prompt_tokens: 5, total_tokens: 5 },
    },
  };
}

afterEach(() => setEmbeddingsMistralCloudHttpClient(null));

describe("batch-queue embeddingsMistralCloud — @n8n/n8n-nodes-langchain.embeddingsMistralCloud", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Embeddings Mistral Cloud");
  });

  it("builds an embeddings handle with model + defaults", async () => {
    const out = await runModel({});
    const handle = getHandle(out);

    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("mistral-embed");
    expect(handle.batchSize).toBe(0);
    expect(handle.stripNewLines).toBe(true);
    expect(typeof handle.embedQuery).toBe("function");
    expect(typeof handle.embedDocuments).toBe("function");
  });

  it("resolves model from expression against first item (sub-node rule)", async () => {
    const out = await runModel({ model: "={{ $json.customModel }}" }, [
      { customModel: "mistral-embed-2" },
    ]);
    expect(getHandle(out).model).toBe("mistral-embed-2");
  });

  it("accepts a resource-locator model value", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "mistral-embed-2" },
    });
    expect(getHandle(out).model).toBe("mistral-embed-2");
  });

  it("throws when mistralCloudApi credential is missing", async () => {
    await expect(runModel({}, [{}], {})).rejects.toThrow(/credential "mistralCloudApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(runModel({}, [{}], { mistralCloudApi: { apiKey: "" } })).rejects.toThrow(
      /missing apiKey/,
    );
  });

  it("embedDocuments calls /v1/embeddings with correct body and returns vectors", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setEmbeddingsMistralCloudHttpClient(async (opts) => {
      captured.push({
        url: opts.url,
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: opts.body,
      });
      return embeddingsResponse([fakeVec(1024, 1), fakeVec(1024, 2)]);
    });

    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments(["Hello world", "OpenFlow is a workflow engine"]);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(1024);
    expect(vectors[1]).toHaveLength(1024);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.mistral.ai/v1/embeddings");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer sk-test-mistral-key");
    expect(captured[0].body).toMatchObject({
      model: "mistral-embed",
      input: ["Hello world", "OpenFlow is a workflow engine"],
    });
  });

  it("embedQuery returns a single vector", async () => {
    setEmbeddingsMistralCloudHttpClient(async () => embeddingsResponse([fakeVec(1024, 7)]));

    const out = await runModel({});
    const handle = getHandle(out);
    const vec = await handle.embedQuery("Hello world");

    expect(vec).toHaveLength(1024);
    expect(vec[0]).toBeCloseTo(0.007, 3);
  });

  it("stripNewLines enabled (default) removes newlines from input", async () => {
    const captured: Array<{ body: unknown }> = [];
    setEmbeddingsMistralCloudHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return embeddingsResponse([fakeVec(8, 1), fakeVec(8, 2)]);
    });

    const out = await runModel({ model: "mistral-embed" });
    const handle = getHandle(out);
    await handle.embedDocuments(["Hello\nworld", "Line1\nLine2\nLine3"]);

    const input = (captured[0].body as { input: string[] }).input;
    expect(input).toEqual(["Helloworld", "Line1Line2Line3"]);
  });

  it("stripNewLines disabled preserves newlines", async () => {
    const captured: Array<{ body: unknown }> = [];
    setEmbeddingsMistralCloudHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return embeddingsResponse([fakeVec(8, 1)]);
    });

    const out = await runModel({ model: "mistral-embed", options: { stripNewLines: false } });
    const handle = getHandle(out);
    await handle.embedDocuments(["Hello\nworld"]);

    const input = (captured[0].body as { input: string[] }).input;
    expect(input).toEqual(["Hello\nworld"]);
  });

  it("batch size splits requests and concatenates in order", async () => {
    const calls: Array<{ input: string[] }> = [];
    setEmbeddingsMistralCloudHttpClient(async (opts) => {
      const input = (opts.body as { input: string[] }).input;
      calls.push({ input });
      return embeddingsResponse(input.map((_, i) => fakeVec(4, calls.length * 100 + i)));
    });

    const out = await runModel({ model: "mistral-embed", options: { batchSize: 2 } });
    const handle = getHandle(out);

    const texts = ["t1", "t2", "t3", "t4", "t5"];
    const vectors = await handle.embedDocuments(texts);

    expect(vectors).toHaveLength(5);
    expect(calls).toHaveLength(3);
    expect(calls[0].input).toEqual(["t1", "t2"]);
    expect(calls[1].input).toEqual(["t3", "t4"]);
    expect(calls[2].input).toEqual(["t5"]);
  });

  it("empty input array returns empty vector list", async () => {
    setEmbeddingsMistralCloudHttpClient(async () => embeddingsResponse([]));

    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments([]);

    expect(vectors).toEqual([]);
  });

  it("surfaces 401 authentication errors clearly", async () => {
    setEmbeddingsMistralCloudHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { message: "Invalid API key" },
    }));

    const out = await runModel({ model: "mistral-embed" });
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/authentication failed/i);
  });

  it("surfaces 429 rate-limit errors clearly", async () => {
    setEmbeddingsMistralCloudHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { message: "Rate limit" },
    }));

    const out = await runModel({ model: "mistral-embed" });
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/rate limit/i);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

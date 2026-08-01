import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setEmbeddingsCohereHttpClient,
  type EmbeddingsCohereHandle,
} from "../../executors/embeddings-cohere";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.embeddingsCohere";

const COHERE_CRED = {
  apiKey: "cohere-test-key",
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
    cohereApi: COHERE_CRED,
  },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): EmbeddingsCohereHandle {
  return out[0][0].json as unknown as EmbeddingsCohereHandle;
}

function fakeVec(dim: number, seed: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < dim; i++) {
    v.push((seed + i) * 0.001);
  }
  return v;
}

function cohereEmbedResponse(vectors: number[][]) {
  return {
    status: 200,
    headers: {},
    body: {
      id: "test-id",
      embeddings: { float: vectors },
      texts: vectors.map(() => "text"),
      meta: { billed_units: { input_tokens: 5 } },
    },
  };
}

afterEach(() => setEmbeddingsCohereHttpClient(null));

describe("batch-queue embeddingsCohere — @n8n/n8n-nodes-langchain.embeddingsCohere", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Embeddings Cohere");
  });

  it("builds an embeddings handle with default model", async () => {
    const out = await runModel({});
    const handle = getHandle(out);

    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("embed-english-v2.0");
    expect(typeof handle.embedQuery).toBe("function");
    expect(typeof handle.embedDocuments).toBe("function");
  });

  it("resolves model from parameter", async () => {
    const out = await runModel({ model: "embed-multilingual-v2.0" });
    expect(getHandle(out).model).toBe("embed-multilingual-v2.0");
  });

  it("resolves model from expression against first item (sub-node rule)", async () => {
    const out = await runModel({ model: "={{ $json.customModel }}" }, [
      { customModel: "embed-english-light-v2.0" },
    ]);
    expect(getHandle(out).model).toBe("embed-english-light-v2.0");
  });

  it("throws when cohereApi credential is missing", async () => {
    await expect(runModel({}, [{}], {})).rejects.toThrow(/credential "cohereApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(runModel({}, [{}], { cohereApi: { apiKey: "" } })).rejects.toThrow(
      /missing apiKey/,
    );
  });

  it("embedDocuments calls Cohere Embed API with correct body and returns vectors", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setEmbeddingsCohereHttpClient(async (opts) => {
      captured.push({
        url: opts.url,
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: opts.body,
      });
      return cohereEmbedResponse([fakeVec(4096, 1), fakeVec(4096, 2)]);
    });

    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments(["Hello world", "OpenFlow is a workflow engine"]);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(4096);
    expect(vectors[1]).toHaveLength(4096);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.cohere.com/v2/embed");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer cohere-test-key");
    expect(captured[0].body).toMatchObject({
      model: "embed-english-v2.0",
      input_type: "search_document",
      texts: ["Hello world", "OpenFlow is a workflow engine"],
      embedding_types: ["float"],
    });
  });

  it("embedQuery returns a single vector", async () => {
    setEmbeddingsCohereHttpClient(async () => cohereEmbedResponse([fakeVec(4096, 7)]));

    const out = await runModel({});
    const handle = getHandle(out);
    const vec = await handle.embedQuery("Hello world");

    expect(vec).toHaveLength(4096);
    expect(vec[0]).toBeCloseTo(0.007, 3);
  });

  it("model selection changes vector dimensions appropriately", async () => {
    const respMap: Record<string, number> = {
      "embed-english-v2.0": 4096,
      "embed-english-light-v2.0": 1024,
      "embed-multilingual-v2.0": 768,
    };

    for (const [model, dim] of Object.entries(respMap)) {
      setEmbeddingsCohereHttpClient(async () => cohereEmbedResponse([fakeVec(dim, 0)]));

      const out = await runModel({ model });
      const handle = getHandle(out);
      const vectors = await handle.embedDocuments(["test"]);

      expect(vectors[0]).toHaveLength(dim);
    }
  });

  it("batch splitting at 96-text API limit", async () => {
    const calls: Array<{ texts: string[] }> = [];
    setEmbeddingsCohereHttpClient(async (opts) => {
      const body = opts.body as { texts: string[] };
      calls.push({ texts: body.texts });
      return cohereEmbedResponse(body.texts.map((_, i) => fakeVec(4, calls.length * 100 + i)));
    });

    const out = await runModel({});
    const handle = getHandle(out);

    const texts = Array.from({ length: 200 }, (_, i) => `t${i}`);
    const vectors = await handle.embedDocuments(texts);

    expect(vectors).toHaveLength(200);
    expect(calls).toHaveLength(3);
    expect(calls[0].texts).toHaveLength(96);
    expect(calls[1].texts).toHaveLength(96);
    expect(calls[2].texts).toHaveLength(8);
    expect(calls[0].texts[0]).toBe("t0");
    expect(calls[2].texts[7]).toBe("t199");
  });

  it("empty input array returns empty vector list", async () => {
    setEmbeddingsCohereHttpClient(async () => cohereEmbedResponse([]));

    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments([]);

    expect(vectors).toEqual([]);
  });

  it("surfaces 401 authentication errors clearly", async () => {
    setEmbeddingsCohereHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { message: "Invalid API key" },
    }));

    const out = await runModel({});
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/authentication failed/i);
  });

  it("surfaces 429 rate-limit errors clearly", async () => {
    setEmbeddingsCohereHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { message: "Rate limit" },
    }));

    const out = await runModel({});
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/rate limit/i);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

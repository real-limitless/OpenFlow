import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setEmbeddingsAzureOpenAiHttpClient,
  type EmbeddingsAzureOpenAiHandle,
} from "../../executors/embeddings-azure-openai";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.embeddingsAzureOpenAi";

const AZURE_CRED = {
  resourceName: "myopenai",
  apiKey: "sk-azure-test-key",
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
  parameters: Record<string, unknown> = {},
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = {
    azureOpenAiApi: AZURE_CRED,
  },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): EmbeddingsAzureOpenAiHandle {
  return out[0][0].json as unknown as EmbeddingsAzureOpenAiHandle;
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
      data: vectors.map((embedding) => ({ embedding })),
      model: "deployment-name",
      usage: { prompt_tokens: 5, total_tokens: 5 },
    },
  };
}

afterEach(() => setEmbeddingsAzureOpenAiHttpClient(null));

describe("batch-queue embeddingsAzureOpenAi — @n8n/n8n-nodes-langchain.embeddingsAzureOpenAi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Embeddings Azure OpenAI");
  });

  it("builds an embeddings handle with model + defaults", async () => {
    const out = await runModel({ model: "my-text-embedding-ada-002" });
    const handle = getHandle(out);

    expect(handle.type).toBe(TYPE);
    expect(handle.resourceName).toBe("myopenai");
    expect(handle.deploymentName).toBe("my-text-embedding-ada-002");
    expect(handle.apiVersion).toBe("2024-06-01");
    expect(handle.batchSize).toBe(50);
    expect(handle.stripNewLines).toBe(true);
    expect(handle.timeout).toBe(-1);
    expect(typeof handle.embedQuery).toBe("function");
    expect(typeof handle.embedDocuments).toBe("function");
  });

  it("resolves model from expression against first item (sub-node rule)", async () => {
    const out = await runModel({ model: "={{ $json.deployment }}" }, [
      { deployment: "deploy-a" },
      { deployment: "deploy-b" },
    ]);
    expect(getHandle(out).deploymentName).toBe("deploy-a");
  });

  it("throws when azureOpenAiApi credential is missing", async () => {
    await expect(runModel({ model: "test" }, [{}], {})).rejects.toThrow(
      /credential "azureOpenAiApi"/i,
    );
  });

  it("throws when resourceName is empty", async () => {
    await expect(
      runModel({ model: "test" }, [{}], {
        azureOpenAiApi: { resourceName: "", apiKey: "key", apiVersion: "v1" },
      }),
    ).rejects.toThrow(/missing resourceName/);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel({ model: "test" }, [{}], {
        azureOpenAiApi: { resourceName: "myopenai", apiKey: "", apiVersion: "v1" },
      }),
    ).rejects.toThrow(/missing apiKey/);
  });

  it("throws when model parameter is empty", async () => {
    await expect(runModel({ model: "" })).rejects.toThrow(/deployment name.*required/i);
  });

  it("embedDocuments calls Azure endpoint with correct URL, headers, and body", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setEmbeddingsAzureOpenAiHttpClient(async (opts) => {
      captured.push({
        url: opts.url,
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: opts.body,
      });
      return embeddingsResponse([fakeVec(1536, 1), fakeVec(1536, 2)]);
    });

    const out = await runModel({ model: "my-text-embedding-ada-002" });
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments(["Hello world", "Azure embeddings test"]);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(1536);
    expect(vectors[1]).toHaveLength(1536);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(
      "https://myopenai.openai.azure.com/openai/deployments/my-text-embedding-ada-002/embeddings?api-version=2024-06-01",
    );
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers["api-key"]).toBe("sk-azure-test-key");
    expect(captured[0].body).toMatchObject({
      model: "my-text-embedding-ada-002",
      input: ["Hello world", "Azure embeddings test"],
      encoding_format: "float",
    });
  });

  it("embedQuery returns a single vector", async () => {
    setEmbeddingsAzureOpenAiHttpClient(async () => embeddingsResponse([fakeVec(1536, 7)]));

    const out = await runModel({ model: "test" });
    const handle = getHandle(out);
    const vec = await handle.embedQuery("Hello world");

    expect(vec).toHaveLength(1536);
    expect(vec[0]).toBeCloseTo(0.007, 3);
  });

  it("stripNewLines enabled (default) replaces newlines with space", async () => {
    const captured: Array<{ body: unknown }> = [];
    setEmbeddingsAzureOpenAiHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return embeddingsResponse([fakeVec(8, 1)]);
    });

    const out = await runModel({ model: "test" });
    const handle = getHandle(out);
    await handle.embedDocuments(["Line one\nLine two"]);

    const input = (captured[0].body as { input: string[] }).input;
    expect(input).toEqual(["Line one Line two"]);
  });

  it("stripNewLines disabled preserves newlines", async () => {
    const captured: Array<{ body: unknown }> = [];
    setEmbeddingsAzureOpenAiHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return embeddingsResponse([fakeVec(8, 1)]);
    });

    const out = await runModel({ model: "test", stripNewLines: false });
    const handle = getHandle(out);
    await handle.embedDocuments(["Line one\nLine two"]);

    const input = (captured[0].body as { input: string[] }).input;
    expect(input).toEqual(["Line one\nLine two"]);
  });

  it("batch size splits requests and concatenates in order", async () => {
    const calls: Array<{ input: string[] }> = [];
    setEmbeddingsAzureOpenAiHttpClient(async (opts) => {
      const input = (opts.body as { input: string[] }).input;
      calls.push({ input });
      return embeddingsResponse(input.map((_, i) => fakeVec(4, calls.length * 100 + i)));
    });

    const out = await runModel({ model: "test", batchSize: 2 });
    const handle = getHandle(out);

    const texts = ["a", "b", "c", "d", "e"];
    const vectors = await handle.embedDocuments(texts);

    expect(vectors).toHaveLength(5);
    expect(calls).toHaveLength(3);
    expect(calls[0].input).toEqual(["a", "b"]);
    expect(calls[1].input).toEqual(["c", "d"]);
    expect(calls[2].input).toEqual(["e"]);
  });

  it("empty input array returns empty vector list", async () => {
    setEmbeddingsAzureOpenAiHttpClient(async () => embeddingsResponse([]));

    const out = await runModel({ model: "test" });
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments([]);

    expect(vectors).toEqual([]);
  });

  it("surfaces 401 authentication errors clearly", async () => {
    setEmbeddingsAzureOpenAiHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { error: { message: "Invalid API key" } },
    }));

    const out = await runModel({ model: "test", batchSize: 1 });
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/authentication failed/i);
  });

  it("surfaces 404 deployment-not-found errors clearly", async () => {
    setEmbeddingsAzureOpenAiHttpClient(async () => ({
      status: 404,
      headers: {},
      body: { error: { message: "Deployment not found" } },
    }));

    const out = await runModel({ model: "test", batchSize: 1 });
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/deployment not found/i);
  });

  it("surfaces 429 rate-limit errors clearly", async () => {
    setEmbeddingsAzureOpenAiHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({ model: "test", batchSize: 1 });
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/rate limit/i);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

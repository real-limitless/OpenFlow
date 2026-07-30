import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setEmbeddingsOpenAiHttpClient,
  type EmbeddingsOpenAiHandle,
} from "../../executors/embeddings-openai";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.embeddingsOpenAi";

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
  credentials: Record<string, Record<string, unknown>> = {
    openAiApi: OPENAI_CRED,
  },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): EmbeddingsOpenAiHandle {
  return out[0][0].json as unknown as EmbeddingsOpenAiHandle;
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
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 5, total_tokens: 5 },
    },
  };
}

afterEach(() => setEmbeddingsOpenAiHttpClient(null));

describe("batch-queue embeddingsOpenAi — @n8n/n8n-nodes-langchain.embeddingsOpenAi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Embeddings OpenAI");
  });

  it("builds an embeddings handle with model + defaults", async () => {
    const out = await runModel({});
    const handle = getHandle(out);

    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("text-embedding-3-small");
    expect(handle.baseUrl).toBe("https://api.openai.com/v1");
    expect(handle.batchSize).toBe(512);
    expect(handle.stripNewLines).toBe(true);
    expect(handle.timeout).toBe(-1);
    expect(typeof handle.embedQuery).toBe("function");
    expect(typeof handle.embedDocuments).toBe("function");
  });

  it("resolves model from expression against first item (sub-node rule)", async () => {
    const out = await runModel({ model: "={{ $json.customModel }}" }, [
      { customModel: "text-embedding-3-large" },
    ]);
    expect(getHandle(out).model).toBe("text-embedding-3-large");
  });

  it("accepts a resource-locator model value", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "text-embedding-ada-002" },
    });
    expect(getHandle(out).model).toBe("text-embedding-ada-002");
  });

  it("throws when openAiApi credential is missing", async () => {
    await expect(runModel({}, [{}], {})).rejects.toThrow(/credential "openAiApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(runModel({}, [{}], { openAiApi: { apiKey: "" } })).rejects.toThrow(
      /missing apiKey/,
    );
  });

  it("embedDocuments calls /embeddings with correct body and returns vectors", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setEmbeddingsOpenAiHttpClient(async (opts) => {
      captured.push({
        url: opts.url,
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: opts.body,
      });
      return embeddingsResponse([fakeVec(1536, 1), fakeVec(1536, 2)]);
    });

    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments(["Hello world", "OpenFlow is a workflow engine"]);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(1536);
    expect(vectors[1]).toHaveLength(1536);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.openai.com/v1/embeddings");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer sk-test-key");
    expect(captured[0].headers["openai-organization"]).toBe("org-test");
    expect(captured[0].body).toMatchObject({
      model: "text-embedding-3-small",
      input: ["Hello world", "OpenFlow is a workflow engine"],
    });
  });

  it("embedQuery returns a single vector", async () => {
    setEmbeddingsOpenAiHttpClient(async () => embeddingsResponse([fakeVec(1536, 7)]));

    const out = await runModel({});
    const handle = getHandle(out);
    const vec = await handle.embedQuery("Hello world");

    expect(vec).toHaveLength(1536);
    expect(vec[0]).toBeCloseTo(0.007, 3);
  });

  it("stripNewLines enabled (default) removes newlines from input", async () => {
    const captured: Array<{ body: unknown }> = [];
    setEmbeddingsOpenAiHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return embeddingsResponse([fakeVec(8, 1), fakeVec(8, 2)]);
    });

    const out = await runModel({});
    const handle = getHandle(out);
    await handle.embedDocuments(["Hello\nworld", "Line1\nLine2\nLine3"]);

    const input = (captured[0].body as { input: string[] }).input;
    expect(input).toEqual(["Helloworld", "Line1Line2Line3"]);
  });

  it("stripNewLines disabled preserves newlines", async () => {
    const captured: Array<{ body: unknown }> = [];
    setEmbeddingsOpenAiHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return embeddingsResponse([fakeVec(8, 1)]);
    });

    const out = await runModel({ stripNewLines: false });
    const handle = getHandle(out);
    await handle.embedDocuments(["Hello\nworld"]);

    const input = (captured[0].body as { input: string[] }).input;
    expect(input).toEqual(["Hello\nworld"]);
  });

  it("custom baseURL posts to the self-hosted endpoint", async () => {
    const captured: Array<{ url: string }> = [];
    setEmbeddingsOpenAiHttpClient(async (opts) => {
      captured.push({ url: opts.url });
      return embeddingsResponse([fakeVec(8, 1)]);
    });

    const out = await runModel({
      baseURL: "http://localhost:1234/v1",
      model: "text-embedding-3-small",
    });
    const handle = getHandle(out);
    await handle.embedQuery("hi");

    expect(captured[0].url).toBe("http://localhost:1234/v1/embeddings");
  });

  it("batch size splits requests and concatenates in order", async () => {
    const calls: Array<{ input: string[] }> = [];
    setEmbeddingsOpenAiHttpClient(async (opts) => {
      const input = (opts.body as { input: string[] }).input;
      calls.push({ input });
      return embeddingsResponse(input.map((_, i) => fakeVec(4, calls.length * 100 + i)));
    });

    const out = await runModel({ batchSize: 512 });
    const handle = getHandle(out);

    const texts = Array.from({ length: 1200 }, (_, i) => `t${i}`);
    const vectors = await handle.embedDocuments(texts);

    expect(vectors).toHaveLength(1200);
    expect(calls).toHaveLength(3);
    expect(calls[0].input).toHaveLength(512);
    expect(calls[1].input).toHaveLength(512);
    expect(calls[2].input).toHaveLength(176);
    expect(calls[0].input[0]).toBe("t0");
    expect(calls[2].input[175]).toBe("t1199");
  });

  it("empty input array returns empty vector list", async () => {
    setEmbeddingsOpenAiHttpClient(async () => embeddingsResponse([]));

    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments([]);

    expect(vectors).toEqual([]);
  });

  it("surfaces 401 authentication errors clearly", async () => {
    setEmbeddingsOpenAiHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { error: { message: "Invalid API key" } },
    }));

    const out = await runModel({ batchSize: 1 });
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/authentication failed/i);
  });

  it("surfaces 429 rate-limit errors clearly", async () => {
    setEmbeddingsOpenAiHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({ batchSize: 1 });
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/rate limit/i);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

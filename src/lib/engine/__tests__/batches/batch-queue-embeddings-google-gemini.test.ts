import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setEmbeddingsGoogleGeminiHttpClient,
  type EmbeddingsGoogleGeminiHandle,
} from "../../executors/embeddings-google-gemini";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.embeddingsGoogleGemini";

const GOOGLE_CRED = {
  apiKey: "test-google-api-key",
  host: "https://generativelanguage.googleapis.com",
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
    googlePalmApi: GOOGLE_CRED,
  },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): EmbeddingsGoogleGeminiHandle {
  return out[0][0].json as unknown as EmbeddingsGoogleGeminiHandle;
}

function fakeVec(dim: number, seed: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < dim; i++) {
    v.push((seed + i) * 0.001);
  }
  return v;
}

function singleEmbeddingResponse(vector: number[]) {
  return {
    status: 200,
    headers: {},
    body: {
      embedding: { values: vector },
    },
  };
}

function batchEmbeddingsResponse(vectors: number[][]) {
  return {
    status: 200,
    headers: {},
    body: {
      embeddings: vectors.map((values) => ({ values })),
    },
  };
}

afterEach(() => setEmbeddingsGoogleGeminiHttpClient(null));

describe("batch-queue embeddingsGoogleGemini — @n8n/n8n-nodes-langchain.embeddingsGoogleGemini", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Embeddings Google Gemini");
  });

  it("builds an embeddings handle with model + defaults", async () => {
    const out = await runModel({});
    const handle = getHandle(out);

    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("models/gemini-embedding-001");
    expect(typeof handle.embedQuery).toBe("function");
    expect(typeof handle.embedDocuments).toBe("function");
  });

  it("resolves model from expression against first item (sub-node rule)", async () => {
    const out = await runModel({ modelName: "={{ $json.customModel }}" }, [
      { customModel: "models/text-embedding-004" },
    ]);
    expect(getHandle(out).model).toBe("models/text-embedding-004");
  });

  it("throws when googlePalmApi credential is missing", async () => {
    await expect(runModel({}, [{}], {})).rejects.toThrow(/credential "googlePalmApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel({}, [{}], { googlePalmApi: { apiKey: "", host: "" } }),
    ).rejects.toThrow(/missing apiKey/);
  });

  it("embedDocuments with one text calls embedContent and returns a vector", async () => {
    const captured: Array<{ url: string; body: unknown; headers?: Record<string, string> }> = [];

    setEmbeddingsGoogleGeminiHttpClient(async (opts) => {
      captured.push({ url: opts.url, body: opts.body, headers: opts.headers });
      return singleEmbeddingResponse(fakeVec(768, 1));
    });

    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments(["Hello world"]);

    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toHaveLength(768);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
    );
    expect(captured[0].headers?.["x-goog-api-key"]).toBe("test-google-api-key");
    const body = captured[0].body as { model?: string };
    expect(body.model).toBe("models/gemini-embedding-001");
  });

  it("embedDocuments with multiple texts calls batchEmbedContents and returns vectors", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];

    setEmbeddingsGoogleGeminiHttpClient(async (opts) => {
      captured.push({ url: opts.url, body: opts.body });
      return batchEmbeddingsResponse([fakeVec(768, 1), fakeVec(768, 2)]);
    });

    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments(["Hello world", "OpenFlow is a workflow engine"]);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(768);
    expect(vectors[1]).toHaveLength(768);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents",
    );
    const body = captured[0].body as { requests?: Array<{ model: string }> };
    expect(body.requests).toHaveLength(2);
    expect(body.requests?.[0].model).toBe("models/gemini-embedding-001");
  });

  it("embedQuery returns a single vector", async () => {
    setEmbeddingsGoogleGeminiHttpClient(async () => singleEmbeddingResponse(fakeVec(768, 7)));

    const out = await runModel({});
    const handle = getHandle(out);
    const vec = await handle.embedQuery("Hello world");

    expect(vec).toHaveLength(768);
    expect(vec[0]).toBeCloseTo(0.007, 3);
  });

  it("uses the configured model name in URL path and request body", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];

    setEmbeddingsGoogleGeminiHttpClient(async (opts) => {
      captured.push({ url: opts.url, body: opts.body });
      return batchEmbeddingsResponse([fakeVec(768, 1)]);
    });

    const out = await runModel({ modelName: "models/text-embedding-004" });
    const handle = getHandle(out);
    await handle.embedDocuments(["hi", "there"]);

    expect(handle.model).toBe("models/text-embedding-004");
    expect(captured[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents",
    );
    const body = captured[0].body as { requests?: Array<{ model: string }> };
    expect(body.requests?.[0].model).toBe("models/text-embedding-004");
  });

  it("empty input array returns empty vector list", async () => {
    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments([]);
    expect(vectors).toEqual([]);
  });

  it("surfaces 401 authentication errors clearly", async () => {
    setEmbeddingsGoogleGeminiHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { error: { message: "API key not valid" } },
    }));

    const out = await runModel({});
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/authentication failed/i);
  });

  it("surfaces 429 rate-limit errors clearly", async () => {
    setEmbeddingsGoogleGeminiHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({});
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/rate limit/i);
  });

  it("single embedContent call uses bare model id in URL path and full name in body", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];

    setEmbeddingsGoogleGeminiHttpClient(async (opts) => {
      captured.push({ url: opts.url, body: opts.body });
      return singleEmbeddingResponse(fakeVec(768, 1));
    });

    const out = await runModel({});
    const handle = getHandle(out);
    await handle.embedQuery("Single text");

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
    );
    const body = captured[0].body as { model: string; content: { parts: Array<{ text: string }> } };
    expect(body.model).toBe("models/gemini-embedding-001");
    expect(body.content.parts[0].text).toBe("Single text");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

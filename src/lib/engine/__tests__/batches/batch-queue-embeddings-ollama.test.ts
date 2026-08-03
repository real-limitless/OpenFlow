import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setEmbeddingsOllamaHttpClient,
  type EmbeddingsOllamaHandle,
} from "../../executors/embeddings-ollama";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.embeddingsOllama";

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
  credentials: Record<string, Record<string, unknown>> = {
    ollamaApi: OLLAMA_CRED,
  },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): EmbeddingsOllamaHandle {
  return out[0][0].json as unknown as EmbeddingsOllamaHandle;
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
      model: "all-minilm",
      embeddings: vectors,
    },
  };
}

afterEach(() => setEmbeddingsOllamaHttpClient(null));

describe("batch-queue embeddingsOllama — @n8n/n8n-nodes-langchain.embeddingsOllama", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Embeddings Ollama");
  });

  it("builds an embeddings handle with model + defaults", async () => {
    const out = await runModel({});
    const handle = getHandle(out);

    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("all-minilm");
    expect(handle.baseUrl).toBe("http://localhost:11434");
    expect(typeof handle.embedQuery).toBe("function");
    expect(typeof handle.embedDocuments).toBe("function");
  });

  it("resolves model from parameter", async () => {
    const out = await runModel({ model: "nomic-embed-text" });
    expect(getHandle(out).model).toBe("nomic-embed-text");
  });

  it("resolves model from expression against first item (sub-node rule)", async () => {
    const out = await runModel({ model: "={{ $json.customModel }}" }, [
      { customModel: "nomic-embed-text" },
    ]);
    expect(getHandle(out).model).toBe("nomic-embed-text");
  });

  it("falls back to default model when param is empty", async () => {
    const out = await runModel({ model: "" });
    expect(getHandle(out).model).toBe("all-minilm");
  });

  it("throws when ollamaApi credential is missing", async () => {
    await expect(runModel({}, [{}], {})).rejects.toThrow(/credential "ollamaApi"/i);
  });

  it("embedDocuments calls /api/embed with correct body and returns vectors", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setEmbeddingsOllamaHttpClient(async (opts) => {
      captured.push({
        url: opts.url,
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: opts.body,
      });
      return embeddingsResponse([fakeVec(384, 1), fakeVec(384, 2)]);
    });

    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments(["Hello world", "OpenFlow is a workflow engine"]);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(384);
    expect(vectors[1]).toHaveLength(384);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("http://localhost:11434/api/embed");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers["content-type"]).toBe("application/json");
    expect(captured[0].headers.authorization).toBeUndefined();
    expect(captured[0].body).toMatchObject({
      model: "all-minilm",
      input: ["Hello world", "OpenFlow is a workflow engine"],
    });
  });

  it("embedQuery returns a single vector", async () => {
    setEmbeddingsOllamaHttpClient(async () => embeddingsResponse([fakeVec(384, 7)]));

    const out = await runModel({});
    const handle = getHandle(out);
    const vec = await handle.embedQuery("Hello world");

    expect(vec).toHaveLength(384);
    expect(vec[0]).toBeCloseTo(0.007, 3);
  });

  it("sends apiKey as Authorization header when present", async () => {
    const captured: Array<{ headers: Record<string, string> }> = [];

    setEmbeddingsOllamaHttpClient(async (opts) => {
      captured.push({ headers: opts.headers ?? {} });
      return embeddingsResponse([fakeVec(8, 1)]);
    });

    await runModel({}, [{}], {
      ollamaApi: { baseUrl: "http://localhost:11434", apiKey: "sk-test" },
    });
    const handle = getHandle(await runModel({}, [{}], {
      ollamaApi: { baseUrl: "http://localhost:11434", apiKey: "sk-test" },
    }));
    await handle.embedQuery("hi");

    expect(captured[0].headers.authorization).toBe("Bearer sk-test");
  });

  it("nomic-embed-text model returns 768-dim vectors", async () => {
    setEmbeddingsOllamaHttpClient(async () => embeddingsResponse([fakeVec(768, 1)]));

    const out = await runModel({ model: "nomic-embed-text" });
    const handle = getHandle(out);
    const vec = await handle.embedQuery("test");

    expect(vec).toHaveLength(768);
  });

  it("empty input array returns empty vector list", async () => {
    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments([]);

    expect(vectors).toEqual([]);
  });

  it("surfaces 404 model-not-found errors clearly", async () => {
    setEmbeddingsOllamaHttpClient(async () => ({
      status: 404,
      headers: {},
      body: { error: "model 'foo' not found" },
    }));

    const out = await runModel({ model: "foo" });
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/model not found/i);
  });

  it("surfaces authentication errors clearly", async () => {
    setEmbeddingsOllamaHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { error: "Unauthorized" },
    }));

    const out = await runModel({});
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/authentication failed/i);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { setRerankerCohereHttpClient } from "../../executors/reranker-cohere";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.rerankerCohere";

const COHERE_CRED = {
  apiKey: "cohere-test-key",
};

const DOCUMENTS = [
  { pageContent: "OpenFlow is a workflow engine", metadata: { source: "doc1" } },
  { pageContent: "The weather is sunny today", metadata: { source: "doc2" } },
  { pageContent: "Workflows automate business processes", metadata: { source: "doc3" } },
];

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

function rerankResponse(results: Array<{ index: number; score: number }>, docs?: typeof DOCUMENTS) {
  const source = docs ?? DOCUMENTS;
  return {
    status: 200,
    headers: {},
    body: {
      id: "test-rerank-id",
      results: results.map((r) => ({
        index: r.index,
        relevance_score: r.score,
        document: { text: source[r.index]?.pageContent ?? "" },
      })),
      meta: { billed_units: { search_units: 1 } },
    },
  };
}

async function runReranker(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = { cohereApi: COHERE_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(
  out: INodeExecutionData[][],
): {
  type: string;
  model: string;
  rerank: (params: {
    query: string;
    documents: Array<{ pageContent: string; metadata?: Record<string, unknown> }>;
    topN?: number;
  }) => Promise<Array<{ pageContent: string; metadata?: Record<string, unknown>; relevanceScore: number }>>;
} {
  return out[0][0].json as unknown as typeof getHandle extends (...args: never[]) => infer R ? R : never;
}

afterEach(() => setRerankerCohereHttpClient(null));

describe("batch-queue rerankerCohere — @n8n/n8n-nodes-langchain.rerankerCohere", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Reranker Cohere");
  });

  it("builds a reranker handle with default model", async () => {
    const out = await runReranker({});
    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("rerank-v3.5");
    expect(typeof handle.rerank).toBe("function");
  });

  it("resolves model from parameter", async () => {
    const out = await runReranker({ modelName: "rerank-english-v3.0" });
    const handle = getHandle(out);
    expect(handle.model).toBe("rerank-english-v3.0");
  });

  it("resolves model from expression against first item (sub-node rule)", async () => {
    const out = await runReranker({ modelName: "={{ $json.customModel }}" }, [
      { customModel: "rerank-multilingual-v3.0" },
    ]);
    const handle = getHandle(out);
    expect(handle.model).toBe("rerank-multilingual-v3.0");
  });

  it("throws when cohereApi credential is missing", async () => {
    await expect(runReranker({}, [{}], {})).rejects.toThrow(/credential "cohereApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(runReranker({}, [{}], { cohereApi: { apiKey: "" } })).rejects.toThrow(
      /missing apiKey/,
    );
  });

  it("rerank calls Cohere Rerank API with correct body and returns reordered documents", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setRerankerCohereHttpClient(async (opts) => {
      captured.push({
        url: opts.url,
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: opts.body,
      });
      return rerankResponse([
        { index: 0, score: 0.95 },
        { index: 2, score: 0.85 },
      ]);
    });

    const out = await runReranker({ modelName: "rerank-v3.5", topN: 2 });
    const handle = getHandle(out);
    const results = await handle.rerank({ query: "What is OpenFlow?", documents: DOCUMENTS });

    expect(results).toHaveLength(2);
    expect(results[0].pageContent).toBe("OpenFlow is a workflow engine");
    expect(results[0].relevanceScore).toBe(0.95);
    expect(results[0].metadata).toEqual({ source: "doc1" });
    expect(results[1].pageContent).toBe("Workflows automate business processes");
    expect(results[1].relevanceScore).toBe(0.85);
    expect(results[1].metadata).toEqual({ source: "doc3" });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.cohere.com/v2/rerank");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer cohere-test-key");
    expect(captured[0].body).toMatchObject({
      model: "rerank-v3.5",
      query: "What is OpenFlow?",
      documents: ["OpenFlow is a workflow engine", "The weather is sunny today", "Workflows automate business processes"],
      top_n: 2,
      return_documents: true,
    });
  });

  it("model selection changes request model parameter", async () => {
    const capturedModel: string[] = [];
    setRerankerCohereHttpClient(async (opts) => {
      const body = opts.body as { model: string };
      capturedModel.push(body.model);
      return rerankResponse([]);
    });

    const out = await runReranker({ modelName: "rerank-english-v3.0", topN: 3 });
    const handle = getHandle(out);
    await handle.rerank({ query: "test", documents: DOCUMENTS.slice(0, 1) });
    expect(capturedModel[0]).toBe("rerank-english-v3.0");
  });

  it("topN limits results (Cohere returns top_n results server-side)", async () => {
    const docs = Array.from({ length: 10 }, (_, i) => ({
      pageContent: `Document ${i}`,
    }));

    setRerankerCohereHttpClient(async (opts) => {
      const body = opts.body as { top_n?: number };
      expect(body.top_n).toBe(3);
      return rerankResponse(
        [{ index: 0, score: 0.95 }, { index: 5, score: 0.85 }, { index: 9, score: 0.75 }],
        docs,
      );
    });

    const out = await runReranker({ modelName: "rerank-v3.5", topN: 3 });
    const handle = getHandle(out);
    const results = await handle.rerank({ query: "test", documents: docs });
    expect(results).toHaveLength(3);
    expect(results[0].pageContent).toBe("Document 0");
  });

  it("empty documents array returns empty result without API call", async () => {
    let called = false;
    setRerankerCohereHttpClient(async () => {
      called = true;
      return rerankResponse([]);
    });

    const out = await runReranker({});
    const handle = getHandle(out);
    const results = await handle.rerank({ query: "anything", documents: [] });
    expect(results).toEqual([]);
    expect(called).toBe(false);
  });

  it("surfaces 401 authentication errors clearly", async () => {
    setRerankerCohereHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { message: "Invalid API key" },
    }));

    const out = await runReranker({});
    const handle = getHandle(out);
    await expect(handle.rerank({ query: "hi", documents: DOCUMENTS.slice(0, 1) })).rejects.toThrow(
      /authentication failed/i,
    );
  });

  it("surfaces 429 rate-limit errors clearly", async () => {
    setRerankerCohereHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { message: "Rate limit" },
    }));

    const out = await runReranker({});
    const handle = getHandle(out);
    await expect(handle.rerank({ query: "hi", documents: DOCUMENTS.slice(0, 1) })).rejects.toThrow(
      /rate limit/i,
    );
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

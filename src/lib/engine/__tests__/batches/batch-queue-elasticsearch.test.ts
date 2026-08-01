import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setElasticsearchClientFactory,
  type ElasticsearchClient,
} from "../../executors/elasticsearch";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.elasticsearch";
const CREDS = {
  elasticsearchApi: {
    node: "http://localhost:9200",
    username: "elastic",
    password: "changeme",
  },
};

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>> = CREDS,
  continueOnFail = false,
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
    continueOnFail,
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

async function runElasticsearch(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = CREDS,
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, opts?.continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function mockElasticsearch(): {
  client: ElasticsearchClient;
  store: Map<string, { _source: Record<string, unknown> }>;
} {
  const store = new Map<string, { _source: Record<string, unknown> }>();

  const client: ElasticsearchClient = {
    async index({ index, body, id }) {
      const docId = id ?? `mock-${Date.now()}`;
      store.set(`${index}:${docId}`, { _source: body });
      return { _id: docId, result: "created" };
    },
    async get({ index, id }) {
      const doc = store.get(`${index}:${id}`);
      if (!doc) return { _id: id, _source: {}, found: false };
      return { _id: id, _source: doc._source, found: true };
    },
    async delete({ index, id }) {
      const deleted = store.delete(`${index}:${id}`);
      return { _id: id, result: deleted ? "deleted" : "not_found" };
    },
    async search({ index, body }) {
      const hits: Array<{ _id: string; _source: Record<string, unknown> }> = [];
      for (const [key, doc] of store) {
        if (key.startsWith(`${index}:`)) {
          const _id = key.slice(index.length + 1);
          hits.push({ _id, _source: doc._source });
        }
      }
      return {
        hits: { hits, total: { value: hits.length } },
      };
    },
    async update({ index, id, body }) {
      const key = `${index}:${id}`;
      const existing = store.get(key);
      if (existing) {
        existing._source = { ...existing._source, ...((body as { doc?: Record<string, unknown> }).doc ?? {}) };
      }
      return { _id: id, result: existing ? "updated" : "not_found" };
    },
    async close() {},
  };

  return { client, store };
}

afterEach(() => setElasticsearchClientFactory(null));

describe("batch-queue elasticsearch — n8n-nodes-base.elasticsearch", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Elasticsearch");
  });

  it("throws when the required credential is missing", async () => {
    setElasticsearchClientFactory(async () => mockElasticsearch().client);
    await expect(runElasticsearch({ operation: "create", resource: "test" }, [{}], {})).rejects.toThrow(
      /credential "elasticsearchApi"/,
    );
  });

  it("create a document", async () => {
    const mock = mockElasticsearch();
    setElasticsearchClientFactory(async () => mock.client);

    const out = await runElasticsearch({
      operation: "create",
      resource: "test_index",
      body: { title: "Hello ES" },
    });
    expect(out[0]).toHaveLength(1);
    expect(out[0]![0]!.json._id).toBeDefined();
    expect(out[0]![0]!.json.result).toBe("created");
  });

  it("get a document", async () => {
    const mock = mockElasticsearch();
    setElasticsearchClientFactory(async () => mock.client);

    await mock.client.index({ index: "test_index", body: { title: "World" }, id: "doc1" });

    const out = await runElasticsearch({
      operation: "get",
      resource: "test_index",
      id: "doc1",
    });
    expect(out[0]![0]!.json.found).toBe(true);
    expect(out[0]![0]!.json.payload).toEqual({ title: "World" });
  });

  it("delete a document", async () => {
    const mock = mockElasticsearch();
    setElasticsearchClientFactory(async () => mock.client);

    await mock.client.index({ index: "test_index", body: { title: "Delete Me" }, id: "doc2" });

    const out = await runElasticsearch({
      operation: "delete",
      resource: "test_index",
      id: "doc2",
    });
    expect(out[0]![0]!.json.result).toBe("deleted");
    expect(mock.store.has("test_index:doc2")).toBe(false);
  });

  it("search documents", async () => {
    const mock = mockElasticsearch();
    setElasticsearchClientFactory(async () => mock.client);

    await mock.client.index({ index: "test_index", body: { title: "First" }, id: "a1" });
    await mock.client.index({ index: "test_index", body: { title: "Second" }, id: "a2" });

    const out = await runElasticsearch({
      operation: "search",
      resource: "test_index",
      query: { match_all: {} },
      size: 10,
    });
    expect(out[0]![0]!.json.total).toBe(2);
    expect(out[0]![0]!.json.hits).toHaveLength(2);
  });

  it("update a document", async () => {
    const mock = mockElasticsearch();
    setElasticsearchClientFactory(async () => mock.client);

    await mock.client.index({ index: "test_index", body: { title: "Original" }, id: "doc3" });

    const out = await runElasticsearch({
      operation: "update",
      resource: "test_index",
      id: "doc3",
      body: { title: "Updated" },
    });
    expect(out[0]![0]!.json.result).toBe("updated");
    expect(mock.store.get("test_index:doc3")?._source.title).toBe("Updated");
  });

  it("continueOnFail yields error shape", async () => {
    const mock = mockElasticsearch();
    setElasticsearchClientFactory(async () => mock.client);
    const out = await runElasticsearch(
      { operation: "unknownOp" },
      [{}],
      CREDS,
      { continueOnFail: true },
    );
    expect(out[0]![0]!.json.error).toBeDefined();
  });
});

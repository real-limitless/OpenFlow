import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setMongoClientFactory,
  type MongoClient,
  type MongoCollection,
  type MongoDatabase,
  type MongoCursor,
  type MongoDocument,
} from "../../executors/mongo-db";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mongoDbTool";
const CREDS: Record<string, Record<string, unknown>> = {
  mongoDb: {
    configurationType: "connectionString",
    connectionString: "mongodb://localhost:27017",
    database: "testdb",
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

async function runMongoDbTool(
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

interface QueryCall {
  method: string;
  args: unknown[];
}

function mockCollection(): { collection: MongoCollection; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  let cursorDocs: MongoDocument[] = [];

  const collection: MongoCollection = {
    find: (filter, options?: Record<string, unknown>) => {
      calls.push({ method: "find", args: [filter, options] });
      const cursor: MongoCursor = {
        sort: (sort) => {
          calls.push({ method: "sort", args: [sort] });
          return cursor;
        },
        limit: (limit) => {
          calls.push({ method: "limit", args: [limit] });
          return cursor;
        },
        skip: (skip) => {
          calls.push({ method: "skip", args: [skip] });
          return cursor;
        },
        project: (projection) => {
          calls.push({ method: "project", args: [projection] });
          return cursor;
        },
        toArray: async () => {
          calls.push({ method: "toArray", args: [] });
          return cursorDocs;
        },
      };
      return cursor;
    },
    aggregate: async (pipeline) => {
      calls.push({ method: "aggregate", args: [pipeline] });
      return cursorDocs;
    },
    insertOne: async (doc) => {
      calls.push({ method: "insertOne", args: [doc] });
      return { insertedId: "abc123" };
    },
    insertMany: async (docs) => {
      calls.push({ method: "insertMany", args: [docs] });
      return { insertedIds: docs.map((_, i) => `id_${i}`) };
    },
    updateOne: async (_filter, _update, _options) => {
      calls.push({ method: "updateOne", args: [_filter, _update, _options] });
      return { matchedCount: 1, modifiedCount: 1 } as any;
    },
    updateMany: async (filter, update, options) => {
      calls.push({ method: "updateMany", args: [filter, update, options] });
      return { matchedCount: 2, modifiedCount: 2, upsertedId: undefined } as any;
    },
    deleteOne: async (_filter) => {
      calls.push({ method: "deleteOne", args: [_filter] });
      return { deletedCount: 1 };
    },
    deleteMany: async (filter) => {
      calls.push({ method: "deleteMany", args: [filter] });
      return { deletedCount: 3 };
    },
    findOneAndUpdate: async (filter, update, options) => {
      calls.push({ method: "findOneAndUpdate", args: [filter, update, options] });
      return { _id: "1", name: "Alice", email: "alice@example.com" };
    },
    findOneAndReplace: async (filter, replacement, options) => {
      calls.push({ method: "findOneAndReplace", args: [filter, replacement, options] });
      return { _id: "1", ...replacement as Record<string, unknown> };
    },
    createSearchIndex: async (indexName, definition, type) => {
      calls.push({ method: "createSearchIndex", args: [indexName, definition, type] });
      return `idx_${indexName}`;
    },
    dropSearchIndex: async (indexName) => {
      calls.push({ method: "dropSearchIndex", args: [indexName] });
    },
    listSearchIndexes: async (indexName) => {
      calls.push({ method: "listSearchIndexes", args: [indexName] });
      return [{ name: "default", status: "READY", queryable: true }];
    },
    updateSearchIndex: async (indexName, definition) => {
      calls.push({ method: "updateSearchIndex", args: [indexName, definition] });
    },
  };

  return {
    collection,
    calls,
    setCursorDocs: (docs: MongoDocument[]) => { cursorDocs = docs; },
  };
}

function mockClient(collection: MongoCollection): MongoClient {
  const db: MongoDatabase = {
    collection: (_name: string) => collection,
  } as MongoDatabase;
  return {
    db: () => db,
    close: async () => {},
  };
}

afterEach(() => setMongoClientFactory(null));

describe("batch-queue mongoDbTool — n8n-nodes-base.mongoDbTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("MongoDB (AI Tool)");
  });

  it("throws when the required credential is missing", async () => {
    setMongoClientFactory(async () => mockClient(mockCollection().collection));
    await expect(runMongoDbTool(
      { resource: "document", operation: "find", collection: "users" },
      [{}],
      {},
    )).rejects.toThrow(/credential "mongoDb"/);
  });

  it("find documents with filter and limit", async () => {
    const mc = mockCollection();
    mc.setCursorDocs([{ _id: "1", name: "Bob", age: 25 }]);
    setMongoClientFactory(async () => mockClient(mc.collection));

    const out = await runMongoDbTool({
      resource: "document",
      operation: "find",
      collection: "users",
      options: {
        find: {
          query: '{ "status": "active" }',
          limit: 10,
        },
      },
    });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ _id: "1", name: "Bob", age: 25 });
    expect(mc.calls.some((c) => c.method === "find")).toBe(true);
    expect(mc.calls.some((c) => c.method === "limit")).toBe(true);
    expect(mc.calls.some((c) => c.method === "toArray")).toBe(true);
  });

  it("insert a single document", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool({
      resource: "document",
      operation: "insert",
      collection: "users",
      options: {
        insert: {
          documents: '{ "name": "Alice", "email": "alice@example.com" }',
        },
      },
    });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ insertedIds: ["abc123"], insertedCount: 1 });
    expect(calls[0].method).toBe("insertOne");
    expect((calls[0].args[0] as Record<string, unknown>)).toEqual({
      name: "Alice",
      email: "alice@example.com",
    });
  });

  it("update documents matching a filter", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool({
      resource: "document",
      operation: "update",
      collection: "users",
      options: {
        update: {
          filters: '{ "email": "alice@example.com" }',
          update: '{ "$set": { "status": "inactive" } }',
          multi: true,
        },
      },
    });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      matchedCount: 2,
      modifiedCount: 2,
    });
    expect(calls[0].method).toBe("updateMany");
  });

  it("delete documents matching a filter", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool({
      resource: "document",
      operation: "delete",
      collection: "users",
      options: {
        delete: {
          query: '{ "status": "inactive" }',
        },
      },
    });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ deletedCount: 3 });
    expect(calls[0].method).toBe("deleteMany");
    expect(calls[0].args[0]).toEqual({ status: "inactive" });
  });

  it("continueOnFail returns error item on exception", async () => {
    const { collection } = mockCollection();
    const failingCollection: MongoCollection = {
      ...collection,
      find: () => { throw new Error("connection refused"); },
    };
    setMongoClientFactory(async () => mockClient(failingCollection));

    const out = await runMongoDbTool(
      { resource: "document", operation: "find", collection: "users", options: { find: { query: "{}" } } },
      [{}],
      CREDS,
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error", "connection refused");
  });
});

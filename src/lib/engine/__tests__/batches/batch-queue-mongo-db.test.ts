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

const TYPE = "n8n-nodes-base.mongoDb";
const CREDS = {
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

async function runMongo(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
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
  let cursorSort: Record<string, unknown> = {};
  let cursorLimit = 0;
  let cursorSkip = 0;
  let cursorProjection: Record<string, unknown> = {};
  let insertedIdCounter = 0;

  const collection: MongoCollection = {
    find: (filter, options?: Record<string, unknown>) => {
      calls.push({ method: "find", args: [filter, options] });
      const cursor: MongoCursor = {
        sort: (sort) => {
          cursorSort = sort;
          return cursor;
        },
        limit: (limit) => {
          cursorLimit = limit;
          return cursor;
        },
        skip: (skip) => {
          cursorSkip = skip;
          return cursor;
        },
        project: (projection) => {
          cursorProjection = projection;
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
      insertedIdCounter++;
      const id = `id_${insertedIdCounter}`;
      calls.push({ method: "insertOne", args: [doc] });
      return { insertedId: id };
    },
    insertMany: async (docs) => {
      insertedIdCounter += docs.length;
      const ids = docs.map((_, i) => `id_${insertedIdCounter - docs.length + i + 1}`);
      calls.push({ method: "insertMany", args: [docs] });
      return { insertedIds: ids };
    },
    updateOne: async (filter, update, options) => {
      calls.push({ method: "updateOne", args: [filter, update, options] });
      return { matchedCount: 1, modifiedCount: 1 };
    },
    updateMany: async (filter, update, options) => {
      calls.push({ method: "updateMany", args: [filter, update, options] });
      return { matchedCount: 1, modifiedCount: 1 };
    },
    deleteOne: async (filter) => {
      calls.push({ method: "deleteOne", args: [filter] });
      return { deletedCount: 1 };
    },
    deleteMany: async (filter) => {
      calls.push({ method: "deleteMany", args: [filter] });
      return { deletedCount: 2 };
    },
    findOneAndUpdate: async (filter, update, options) => {
      calls.push({ method: "findOneAndUpdate", args: [filter, update, options] });
      return { _id: "abc", name: "Updated" };
    },
    findOneAndReplace: async (filter, replacement, options) => {
      calls.push({ method: "findOneAndReplace", args: [filter, replacement, options] });
      return { _id: "abc", ...replacement };
    },
    createSearchIndex: async (indexName, definition, indexType) => {
      calls.push({ method: "createSearchIndex", args: [indexName, definition, indexType] });
      return `idx_${indexName}`;
    },
    dropSearchIndex: async (indexName) => {
      calls.push({ method: "dropSearchIndex", args: [indexName] });
    },
    listSearchIndexes: async (indexName) => {
      calls.push({ method: "listSearchIndexes", args: [indexName] });
      return [{ name: "idx1", status: "ready" }];
    },
    updateSearchIndex: async (indexName, definition) => {
      calls.push({ method: "updateSearchIndex", args: [indexName, definition] });
    },
  };

  function setCursorDocs(docs: MongoDocument[]): void {
    cursorDocs = docs;
  }

  return { collection, calls, setCursorDocs };
}

function mockClient(collection: MongoCollection): MongoClient {
  const db: MongoDatabase = {
    collection: (name) => {
      return collection;
    },
    db: (name) => db,
  };
  return {
    db: () => db,
    close: async () => {},
  };
}

afterEach(() => setMongoClientFactory(null));

describe("batch-queue mongoDb — n8n-nodes-base.mongoDb", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("MongoDB");
  });

  it("throws when the required credential is missing", async () => {
    setMongoClientFactory(async () => mockClient(mockCollection().collection));
    await expect(
      runMongo({ resource: "document", operation: "find", collection: "users" }, [{}], {}),
    ).rejects.toThrow(/credential "mongoDb"/);
  });

  it("find documents with query filter", async () => {
    const { collection, calls, setCursorDocs } = mockCollection();
    setCursorDocs([
      { _id: "1", name: "Alice", email: "alice@example.com", status: "active" },
      { _id: "2", name: "Bob", email: "bob@example.com", status: "active" },
    ]);
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongo(
      {
        resource: "document",
        operation: "find",
        collection: "users",
        query: '{ "status": "active" }',
        options: { limit: 10, sort: '{ "createdAt": -1 }' },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ name: "Alice", status: "active" });
    expect(out[0][1].json).toMatchObject({ name: "Bob", status: "active" });
    expect(calls.some((c) => c.method === "find")).toBe(true);
    expect(calls.some((c) => c.method === "toArray")).toBe(true);
  });

  it("insert document with specified fields", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongo(
      {
        resource: "document",
        operation: "insert",
        collection: "users",
        fields: "name,email",
      },
      [{ json: { name: "Alice", email: "alice@example.com", role: "admin" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ name: "Alice", email: "alice@example.com" });
    expect(out[0][0].json._id).toBeDefined();
    expect(calls[0].method).toBe("insertOne");
    expect(calls[0].args[0]).toEqual({ name: "Alice", email: "alice@example.com" });
  });

  it("update documents by updateKey", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongo(
      {
        resource: "document",
        operation: "update",
        collection: "users",
        updateKey: "id",
        fields: "name,email",
        upsert: false,
      },
      [{ json: { id: "abc123", name: "Bob", email: "bob@example.com" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ matchedCount: 1, modifiedCount: 1 });
    expect(calls[0].method).toBe("updateMany");
    expect(calls[0].args[0]).toEqual({ id: "abc123" });
    expect(calls[0].args[1]).toEqual({ $set: { name: "Bob", email: "bob@example.com" } });
  });

  it("delete documents with query filter", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongo(
      {
        resource: "document",
        operation: "delete",
        collection: "users",
        query: '{ "status": "inactive" }',
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ deletedCount: 2 });
    expect(calls[0].method).toBe("deleteMany");
    expect(calls[0].args[0]).toEqual({ status: "inactive" });
  });

  it("aggregate pipeline", async () => {
    const { collection, calls, setCursorDocs } = mockCollection();
    setCursorDocs([{ _id: "active", count: 5 }, { _id: "inactive", count: 3 }]);
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongo(
      {
        resource: "document",
        operation: "aggregate",
        collection: "orders",
        query: '[{ "$group": { "_id": "$status", "count": { "$sum": 1 } } }]',
      },
      [{}],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ _id: "active", count: 5 });
    expect(calls[0].method).toBe("aggregate");
  });

  it("findOneAndUpdate", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongo(
      {
        resource: "document",
        operation: "findOneAndUpdate",
        collection: "users",
        updateKey: "id",
        fields: "name",
        upsert: true,
      },
      [{ json: { id: "abc", name: "Charlie" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ name: "Updated" });
    expect(calls[0].method).toBe("findOneAndUpdate");
    expect(calls[0].args[0]).toEqual({ id: "abc" });
    expect(calls[0].args[1]).toEqual({ $set: { name: "Charlie" } });
  });

  it("findOneAndReplace", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongo(
      {
        resource: "document",
        operation: "findOneAndReplace",
        collection: "users",
        updateKey: "id",
        fields: "name,email",
        upsert: true,
      },
      [{ json: { id: "abc", name: "Diana", email: "diana@example.com" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ name: "Diana", email: "diana@example.com" });
    expect(calls[0].method).toBe("findOneAndReplace");
    expect(calls[0].args[0]).toEqual({ id: "abc" });
    expect(calls[0].args[1]).toEqual({ name: "Diana", email: "diana@example.com" });
  });

  it("create search index", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongo(
      {
        resource: "searchIndexes",
        operation: "createSearchIndex",
        collection: "products",
        indexNameRequired: "product_search",
        indexType: "search",
        indexDefinition: '{ "mappings": { "dynamic": true } }',
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ indexName: "idx_product_search" });
    expect(calls[0].method).toBe("createSearchIndex");
    expect(calls[0].args[0]).toBe("product_search");
    expect(calls[0].args[2]).toBe("search");
  });

  it("list search indexes", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongo(
      {
        resource: "searchIndexes",
        operation: "listSearchIndexes",
        collection: "products",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ name: "idx1", status: "ready" });
    expect(calls[0].method).toBe("listSearchIndexes");
  });

  it("continueOnFail returns error item", async () => {
    const { collection } = mockCollection();
    const failingCollection: MongoCollection = {
      ...collection,
      find: () => {
        throw new Error("Connection refused");
      },
      aggregate: async () => { throw new Error("Connection refused"); },
      insertOne: async () => { throw new Error("Connection refused"); },
      insertMany: async () => { throw new Error("Connection refused"); },
      updateOne: async () => { throw new Error("Connection refused"); },
      updateMany: async () => { throw new Error("Connection refused"); },
      deleteOne: async () => { throw new Error("Connection refused"); },
      deleteMany: async () => { throw new Error("Connection refused"); },
      findOneAndUpdate: async () => { throw new Error("Connection refused"); },
      findOneAndReplace: async () => { throw new Error("Connection refused"); },
      createSearchIndex: async () => { throw new Error("Connection refused"); },
      dropSearchIndex: async () => { throw new Error("Connection refused"); },
      listSearchIndexes: async () => { throw new Error("Connection refused"); },
      updateSearchIndex: async () => { throw new Error("Connection refused"); },
    };
    setMongoClientFactory(async () => mockClient(failingCollection));

    const out = await runMongo(
      {
        resource: "document",
        operation: "find",
        collection: "users",
        query: "{}",
      },
      [{}],
      CREDS,
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toContain("Connection refused");
  });
});
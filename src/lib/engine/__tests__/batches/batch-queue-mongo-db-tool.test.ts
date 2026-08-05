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

async function runMongoDbTool(
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
      return { insertedId: "id_1" };
    },
    insertMany: async (docs) => {
      calls.push({ method: "insertMany", args: [docs] });
      return { insertedIds: docs.map((_, i) => `id_${i + 1}`) };
    },
    updateOne: async (filter, update, options) => {
      calls.push({ method: "updateOne", args: [filter, update, options] });
      return { matchedCount: 1, modifiedCount: 1, upsertedId: null };
    },
    updateMany: async (filter, update, options) => {
      calls.push({ method: "updateMany", args: [filter, update, options] });
      return { matchedCount: 2, modifiedCount: 2, upsertedId: null };
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
    listSearchIndexes: async () => {
      calls.push({ method: "listSearchIndexes", args: [] });
      return [{ name: "idx1", type: "search", status: "ready" }];
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
    collection: (name) => collection,
    db: (name) => db,
  };
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
    await expect(
      runMongoDbTool(
        { resource: "document", operation: "find", collection: "users" },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "mongoDb"/);
  });

  it("find documents with query filter", async () => {
    const { collection, calls, setCursorDocs } = mockCollection();
    setCursorDocs([
      { _id: "1", name: "Alice", email: "alice@example.com", status: "active" },
      { _id: "2", name: "Bob", email: "bob@example.com", status: "active" },
    ]);
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "document",
        operation: "find",
        collection: "users",
        options: {
          find: {
            query: '={ "status": $json.statusField }',
            limit: 10,
            sort: '{ "createdAt": -1 }',
            projection: '{ "name": 1, "email": 1, "status": 1 }',
          },
        },
      },
      [{ json: { statusField: "active" } }],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ name: "Alice", status: "active" });
    expect(out[0][1].json).toMatchObject({ name: "Bob", status: "active" });
    expect(calls.some((c) => c.method === "find")).toBe(true);
    expect(calls.some((c) => c.method === "toArray")).toBe(true);
  });

  it("insert a single document", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "document",
        operation: "insert",
        collection: "users",
        options: {
          insert: {
            documents: '={ $json }',
          },
        },
      },
      [{ json: { name: "Test User", email: "test@example.com", role: "admin" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ insertedCount: 1 });
    expect(out[0][0].json.insertedIds).toEqual(["id_1"]);
    expect(calls[0].method).toBe("insertOne");
  });

  it("update documents matching filter", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "document",
        operation: "update",
        collection: "users",
        options: {
          update: {
            filters: '={ "role": $json.oldRole }',
            update: '={ { "$set": { "role": $json.newRole } } }',
            multi: true,
          },
        },
      },
      [{ json: { oldRole: "guest", newRole: "member" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ matchedCount: 2, modifiedCount: 2 });
    expect(calls[0].method).toBe("updateMany");
  });

  it("update single document (multi=false)", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "document",
        operation: "update",
        collection: "users",
        options: {
          update: {
            filters: '={ "email": $json.email }',
            update: '={ { "$set": { "name": $json.name } } }',
            multi: false,
          },
        },
      },
      [{ json: { email: "test@example.com", name: "Updated" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(calls[0].method).toBe("updateOne");
  });

  it("delete documents matching filter", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "document",
        operation: "delete",
        collection: "users",
        options: {
          delete: {
            query: '{ "status": "inactive" }',
          },
        },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ deletedCount: 2 });
    expect(calls[0].method).toBe("deleteMany");
  });

  it("delete single document (limit=1)", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "document",
        operation: "delete",
        collection: "users",
        options: {
          delete: {
            query: '{ "status": "inactive" }',
            limit: 1,
          },
        },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(calls[0].method).toBe("deleteOne");
  });

  it("aggregate pipeline", async () => {
    const { collection, calls, setCursorDocs } = mockCollection();
    setCursorDocs([{ _id: "completed", total: 100 }]);
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "document",
        operation: "aggregate",
        collection: "orders",
        options: {
          aggregate: {
            pipeline: '[{ "$match": { "status": "completed" } }, { "$group": { "_id": "$productId", "total": { "$sum": "$amount" } } }]',
          },
        },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ documents: [{ _id: "completed", total: 100 }] });
    expect(calls[0].method).toBe("aggregate");
  });

  it("findOneAndReplace", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "document",
        operation: "findOneAndReplace",
        collection: "users",
        options: {
          findAndReplace: {
            filter: '{ "email": "old@example.com" }',
            replacement: '{ "email": "new@example.com", "name": "Updated" }',
          },
        },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ document: { email: "new@example.com" } });
    expect(calls[0].method).toBe("findOneAndReplace");
  });

  it("findOneAndUpdate", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "document",
        operation: "findOneAndUpdate",
        collection: "users",
        options: {
          findAndUpdate: {
            filter: '{ "email": "test@example.com" }',
            update: '{ "$set": { "name": "Updated" } }',
            options: '{ "returnDocument": "after" }',
          },
        },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ document: { name: "Updated" } });
    expect(calls[0].method).toBe("findOneAndUpdate");
  });

  it("searchIndex list", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "searchIndex",
        operation: "list",
        collection: "products",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      indexes: [{ name: "idx1", type: "search", status: "ready" }],
    });
    expect(calls[0].method).toBe("listSearchIndexes");
  });

  it("searchIndex create", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "searchIndex",
        operation: "create",
        collection: "products",
        options: {
          searchIndex: {
            create: {
              name: "product_search",
              definition: '{ "mappings": { "dynamic": true } }',
            },
          },
        },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ created: true });
    expect(calls[0].method).toBe("createSearchIndex");
  });

  it("searchIndex drop", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "searchIndex",
        operation: "drop",
        collection: "products",
        options: {
          searchIndex: {
            drop: { name: "product_search" },
          },
        },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ dropped: true });
    expect(calls[0].method).toBe("dropSearchIndex");
  });

  it("searchIndex update", async () => {
    const { collection, calls } = mockCollection();
    setMongoClientFactory(async () => mockClient(collection));

    const out = await runMongoDbTool(
      {
        resource: "searchIndex",
        operation: "update",
        collection: "products",
        options: {
          searchIndex: {
            update: {
              name: "product_search",
              definition: '{ "mappings": { "dynamic": false } }',
            },
          },
        },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ updated: true });
    expect(calls[0].method).toBe("updateSearchIndex");
  });

  it("continueOnFail returns error item", async () => {
    const { collection } = mockCollection();
    const failingCollection: MongoCollection = {
      ...collection,
      find: () => { throw new Error("Connection refused"); },
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

    const out = await runMongoDbTool(
      {
        resource: "document",
        operation: "find",
        collection: "users",
        options: { find: { query: "{}" } },
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

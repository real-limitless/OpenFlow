import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import {
  setMongoClientFactory,
  getMongoClientFactory,
  type MongoClient,
  type MongoCollection,
  type MongoDatabase,
  type MongoCursor,
  type MongoDocument,
} from "./mongo-db";

function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseJsonObj(raw: unknown): Record<string, unknown> {
  const p = parseJson(raw);
  if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
  return {};
}

function parseJsonArr(raw: unknown): Record<string, unknown>[] {
  const p = parseJson(raw);
  if (Array.isArray(p)) return p as Record<string, unknown>[];
  return [];
}

function toBool(val: unknown, dflt = false): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val === "true" || val === "1";
  return dflt;
}

function toNum(val: unknown, dflt = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : dflt;
}

async function getClient(ctx: {
  getCredential: (name: string) => Promise<Record<string, unknown> | null>;
}): Promise<MongoClient> {
  const credentials = await ctx.getCredential("mongoDb");
  if (!credentials) {
    throw new Error('MongoDB: credential "mongoDb" is not configured on this node');
  }
  const factory = getMongoClientFactory();
  return factory(credentials);
}

async function executeDocument(
  col: MongoCollection,
  operation: string,
  params: Record<string, unknown>,
  _item: INodeExecutionData,
): Promise<Record<string, unknown>> {
  switch (operation) {
    case "find": {
      const query = parseJsonObj(params.query);
      const sort = parseJsonObj(params.sort);
      const options = parseJsonObj(params.options);
      const limit = toNum(params.limit, toNum(options.limit, 0));
      const skip = toNum(params.skip, toNum(options.skip, 0));
      const projection = parseJsonObj(options.projection ?? "{}");
      const returnAll = toBool(params.returnAll, true);

      let cursor: MongoCursor = col.find(query);
      if (!returnAll && limit > 0) cursor = cursor.limit(limit);
      if (skip > 0) cursor = cursor.skip(skip);
      if (Object.keys(sort).length > 0) cursor = cursor.sort(sort);
      if (Object.keys(projection).length > 0) cursor = cursor.project(projection);

      const docs = await cursor.toArray();
      return { documents: docs };
    }
    case "insert": {
      const docsInput = parseJson(params.documents ?? "{}");
      const docs = Array.isArray(docsInput) ? docsInput : [docsInput];
      if (docs.length === 1) {
        const result = await col.insertOne(docs[0] as Record<string, unknown>);
        return { insertedId: result.insertedId, insertedCount: 1 };
      }
      const result = await col.insertMany(docs as Record<string, unknown>[]);
      return { insertedIds: result.insertedIds, insertedCount: docs.length };
    }
    case "update": {
      const query = parseJsonObj(params.query);
      const updateExpr = parseJsonObj(params.update);
      const upsert = toBool(params.upsert, false);
      const result = await col.updateMany(query, updateExpr, { upsert });
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: (result as { upsertedId?: unknown }).upsertedId ?? null,
        acknowledged: true,
      };
    }
    case "delete": {
      const query = parseJsonObj(params.query);
      const result = await col.deleteMany(query);
      return { deletedCount: result.deletedCount, acknowledged: true };
    }
    case "aggregate": {
      const pipeline = parseJsonArr(params.pipeline ?? "[]");
      const docs = await col.aggregate(pipeline);
      return { documents: docs };
    }
    case "findOneAndUpdate": {
      const query = parseJsonObj(params.query);
      const updateExpr = parseJsonObj(params.update);
      const upsert = toBool(params.upsert, false);
      const doc = await col.findOneAndUpdate(query, updateExpr, {
        upsert,
        returnDocument: "after",
      });
      return { document: doc ?? {} };
    }
    case "findOneAndReplace": {
      const query = parseJsonObj(params.query);
      const replacement = parseJsonObj(params.replacement ?? "{}");
      const upsert = toBool(params.upsert, false);
      const doc = await col.findOneAndReplace(query, replacement, {
        upsert,
        returnDocument: "after",
      });
      return { document: doc ?? {} };
    }
    default:
      throw new Error(`MongoDB Tool: unknown document operation "${operation}"`);
  }
}

async function executeSearchIndex(
  col: MongoCollection,
  operation: string,
  params: Record<string, unknown>,
  _item: INodeExecutionData,
): Promise<Record<string, unknown>> {
  switch (operation) {
    case "create": {
      const indexName = String(params.indexName ?? "");
      const indexDef = parseJsonObj(params.indexDefinition ?? "{}");
      const result = await col.createSearchIndex(indexName, indexDef);
      return { indexName: result };
    }
    case "drop": {
      const indexName = String(params.indexName ?? "");
      await col.dropSearchIndex(indexName);
      return { success: true };
    }
    case "list": {
      const indexName = params.indexName ? String(params.indexName) : undefined;
      const indexes = await col.listSearchIndexes(indexName);
      return { indexes };
    }
    case "update": {
      const indexName = String(params.indexName ?? "");
      const indexDef = parseJsonObj(params.indexDefinition ?? "{}");
      await col.updateSearchIndex(indexName, indexDef);
      return { success: true };
    }
    default:
      throw new Error(`MongoDB Tool: unknown search index operation "${operation}"`);
  }
}

export const mongoDbToolExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const resource = ctx.getParam<string>("resource", "document");
  const operation = ctx.getParam<string>("operation", "find");
  const collection = ctx.getParam<string>("collection", "");
  const continueOnFail = ctx.continueOnFail();

  const client = await getClient(ctx);

  try {
    const dbName = ctx.getParam<string>("database", "");
    const db = dbName ? client.db(dbName) : client.db("");
    const col = db.collection(collection);

    const out: INodeExecutionData[] = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      try {
        let result: Record<string, unknown>;
        if (resource === "document") {
          result = await executeDocument(col, operation, ctx.getParams(), item);
        } else if (resource === "searchIndex") {
          result = await executeSearchIndex(col, operation, ctx.getParams(), item);
        } else {
          throw new Error(`MongoDB Tool: unknown resource "${resource}"`);
        }

        out.push({
          json: result,
          pairedItem: item.pairedItem ?? { item: index, input: 0 },
        });
      } catch (err) {
        if (continueOnFail) {
          out.push({
            json: { error: err instanceof Error ? err.message : String(err) },
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
        } else {
          throw err;
        }
      }
    }

    return [out];
  } finally {
    await client.close().catch(() => {});
  }
};

import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";
import {
  setMongoClientFactory,
  getMongoClientFactory,
  type MongoClient,
  type MongoCollection,
} from "./mongo-db";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>, itemIndex = 0): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson, itemIndex });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function parseJson(raw: unknown, itemJson: Record<string, unknown>, itemIndex = 0): unknown {
  const resolved = resolveValue(raw, itemJson, itemIndex);
  if (typeof resolved === "string" && resolved.trim()) {
    try {
      return JSON.parse(resolved.trim());
    } catch {
      return resolved;
    }
  }
  if (typeof resolved === "object") return resolved;
  return {};
}

function parseJsonArray(raw: unknown, itemJson: Record<string, unknown>, itemIndex = 0): Record<string, unknown>[] {
  const parsed = parseJson(raw, itemJson, itemIndex);
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  return [];
}

export const mongoDbToolExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const resource = ctx.getParam<string>("resource", "document");
  const operation = ctx.getParam<string>("operation", "find");
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("mongoDb");
  if (!credentials) {
    throw new Error('MongoDB Tool: credential "mongoDb" is not configured on this node');
  }

  const factory = getMongoClientFactory();
  const client = await factory(credentials);

  try {
    const collection = ctx.getParam<string>("collection", "");
    if (resource === "document") {
      return await executeDocumentOperation(ctx, client, collection, operation, items, continueOnFail);
    } else if (resource === "searchIndex") {
      return await executeSearchIndexOperation(ctx, client, collection, operation, items, continueOnFail);
    }
    throw new Error(`MongoDB Tool: unknown resource "${resource}"`);
  } finally {
    await client.close().catch(() => {});
  }
};

async function executeDocumentOperation(
  ctx: ExecutionContext,
  client: MongoClient,
  collection: string,
  operation: string,
  items: INodeExecutionData[],
  continueOnFail: boolean,
): Promise<INodeExecutionData[][]> {
  const out: INodeExecutionData[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const resolvedCollection = String(resolveValue(collection, item.json, index) ?? collection);
      const db = client.db();
      const col = db.collection(resolvedCollection);
      const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

      switch (operation) {
        case "find": {
          const findOpts = (options.find ?? {}) as Record<string, unknown>;
          const query = parseJson(findOpts.query ?? "{}", item.json, index) as Record<string, unknown>;
          const limit = Number(findOpts.limit ?? 0);
          const skip = Number(findOpts.skip ?? 0);
          const sort = parseJson(findOpts.sort ?? "{}", item.json, index) as Record<string, unknown>;
          const projection = parseJson(findOpts.projection ?? "{}", item.json, index) as Record<string, unknown>;

          let cursor = col.find(query);
          if (limit > 0) cursor = cursor.limit(limit);
          if (skip > 0) cursor = cursor.skip(skip);
          if (Object.keys(sort).length > 0) cursor = cursor.sort(sort);
          if (Object.keys(projection).length > 0) cursor = cursor.project(projection);

          const docs = await cursor.toArray();
          for (const doc of docs) {
            out.push({
              json: doc as Record<string, unknown>,
              pairedItem: item.pairedItem ?? { item: index, input: 0 },
            });
          }
          break;
        }
        case "insert": {
          const insertOpts = (options.insert ?? {}) as Record<string, unknown>;
          const documents = parseJson(insertOpts.documents ?? "{}", item.json, index);

          let result: { insertedId?: unknown; insertedIds?: unknown[] };
          if (Array.isArray(documents)) {
            result = await col.insertMany(documents as Record<string, unknown>[]);
            out.push({
              json: {
                insertedIds: result.insertedIds ?? [],
                insertedCount: (documents as unknown[]).length,
              } as Record<string, unknown>,
              pairedItem: item.pairedItem ?? { item: index, input: 0 },
            });
          } else {
            result = await col.insertOne(documents as Record<string, unknown>);
            out.push({
              json: {
                insertedIds: [result.insertedId],
                insertedCount: 1,
              } as Record<string, unknown>,
              pairedItem: item.pairedItem ?? { item: index, input: 0 },
            });
          }
          break;
        }
        case "update": {
          const updateOpts = (options.update ?? {}) as Record<string, unknown>;
          const filters = parseJson(updateOpts.filters ?? "{}", item.json, index) as Record<string, unknown>;
          const update = parseJson(updateOpts.update ?? "{}", item.json, index) as Record<string, unknown>;
          const multi = Boolean(updateOpts.multi ?? false);

          let result: { matchedCount: number; modifiedCount: number; upsertedId?: unknown };
          if (multi) {
            result = await col.updateMany(filters, update);
          } else {
            result = await col.updateOne(filters, update);
          }
          out.push({
            json: {
              matchedCount: result.matchedCount,
              modifiedCount: result.modifiedCount,
              upsertedId: result.upsertedId ?? null,
            } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "delete": {
          const deleteOpts = (options.delete ?? {}) as Record<string, unknown>;
          const query = parseJson(deleteOpts.query ?? "{}", item.json, index) as Record<string, unknown>;
          const deleteLimit = Number(deleteOpts.limit ?? 0);

          let result: { deletedCount: number };
          if (deleteLimit === 1) {
            result = await col.deleteOne(query);
          } else {
            result = await col.deleteMany(query);
          }
          out.push({
            json: { deletedCount: result.deletedCount } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "aggregate": {
          const aggOpts = (options.aggregate ?? {}) as Record<string, unknown>;
          const pipeline = parseJsonArray(aggOpts.pipeline ?? "[]", item.json, index);
          const docs = await col.aggregate(pipeline);
          out.push({
            json: { documents: docs as Record<string, unknown>[] } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "findOneAndReplace": {
          const farOpts = (options.findAndReplace ?? {}) as Record<string, unknown>;
          const filter = parseJson(farOpts.filter ?? "{}", item.json, index) as Record<string, unknown>;
          const replacement = parseJson(farOpts.replacement ?? "{}", item.json, index) as Record<string, unknown>;
          const replaced = await col.findOneAndReplace(filter, replacement, { returnDocument: "after" });
          out.push({
            json: { document: (replaced ?? {}) as Record<string, unknown> } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "findOneAndUpdate": {
          const fauOpts = (options.findAndUpdate ?? {}) as Record<string, unknown>;
          const filter = parseJson(fauOpts.filter ?? "{}", item.json, index) as Record<string, unknown>;
          const update = parseJson(fauOpts.update ?? "{}", item.json, index) as Record<string, unknown>;
          const fauOptions = parseJson(fauOpts.options ?? '{"returnDocument": "after"}', item.json, index) as Record<string, unknown>;
          const updated = await col.findOneAndUpdate(filter, update, fauOptions);
          out.push({
            json: { document: (updated ?? {}) as Record<string, unknown> } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        default:
          throw new Error(`MongoDB Tool: unknown document operation "${operation}"`);
      }
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
}

async function executeSearchIndexOperation(
  ctx: ExecutionContext,
  client: MongoClient,
  collection: string,
  operation: string,
  items: INodeExecutionData[],
  continueOnFail: boolean,
): Promise<INodeExecutionData[][]> {
  const out: INodeExecutionData[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const resolvedCollection = String(resolveValue(collection, item.json, index) ?? collection);
      const db = client.db();
      const col = db.collection(resolvedCollection);
      const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

      switch (operation) {
        case "create": {
          const createOpts = (options.searchIndex?.create ?? {}) as Record<string, unknown>;
          const indexName = String(createOpts.name ?? "");
          const definition = parseJson(createOpts.definition ?? "{}", item.json, index) as Record<string, unknown>;
          await col.createSearchIndex(indexName, definition);
          out.push({
            json: { created: true } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "drop": {
          const dropOpts = (options.searchIndex?.drop ?? {}) as Record<string, unknown>;
          const indexName = String(dropOpts.name ?? "");
          await col.dropSearchIndex(indexName);
          out.push({
            json: { dropped: true } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "list": {
          const indexes = await col.listSearchIndexes();
          out.push({
            json: { indexes: indexes as Record<string, unknown>[] } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "update": {
          const updateOpts = (options.searchIndex?.update ?? {}) as Record<string, unknown>;
          const indexName = String(updateOpts.name ?? "");
          const definition = parseJson(updateOpts.definition ?? "{}", item.json, index) as Record<string, unknown>;
          await col.updateSearchIndex(indexName, definition);
          out.push({
            json: { updated: true } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        default:
          throw new Error(`MongoDB Tool: unknown search index operation "${operation}"`);
      }
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
}

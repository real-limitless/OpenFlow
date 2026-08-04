import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

export interface MongoDocument {
  _id?: unknown;
  [key: string]: unknown;
}

export interface MongoClient {
  db(name: string): MongoDatabase;
  close(): Promise<void>;
}

export interface MongoDatabase {
  collection(name: string): MongoCollection;
}

export interface MongoCollection {
  find(filter: Record<string, unknown>, options?: Record<string, unknown>): MongoCursor;
  aggregate(pipeline: Record<string, unknown>[]): Promise<MongoDocument[]>;
  insertOne(doc: Record<string, unknown>): Promise<{ insertedId: unknown }>;
  insertMany(docs: Record<string, unknown>[]): Promise<{ insertedIds: unknown[] }>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, options?: Record<string, unknown>): Promise<{ matchedCount: number; modifiedCount: number; upsertedId?: unknown }>;
  updateMany(filter: Record<string, unknown>, update: Record<string, unknown>, options?: Record<string, unknown>): Promise<{ matchedCount: number; modifiedCount: number }>;
  deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
  deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>, options?: Record<string, unknown>): Promise<MongoDocument | null>;
  findOneAndReplace(filter: Record<string, unknown>, replacement: Record<string, unknown>, options?: Record<string, unknown>): Promise<MongoDocument | null>;
  createSearchIndex(indexName: string, definition: Record<string, unknown>, type?: string): Promise<string>;
  dropSearchIndex(indexName: string): Promise<void>;
  listSearchIndexes(indexName?: string): Promise<MongoDocument[]>;
  updateSearchIndex(indexName: string, definition: Record<string, unknown>): Promise<void>;
}

export interface MongoCursor {
  sort(sort: Record<string, unknown>): MongoCursor;
  limit(limit: number): MongoCursor;
  skip(skip: number): MongoCursor;
  project(projection: Record<string, unknown>): MongoCursor;
  toArray(): Promise<MongoDocument[]>;
}

export type MongoClientFactory = (
  credentials: Record<string, unknown>,
) => Promise<MongoClient>;

let clientFactory: MongoClientFactory | null = null;

export function setMongoClientFactory(factory: MongoClientFactory | null): void {
  clientFactory = factory;
}

export function getMongoClientFactory(): MongoClientFactory {
  return clientFactory ?? DEFAULT_FACTORY;
}

const DEFAULT_FACTORY: MongoClientFactory = async (credentials) => {
  const { MongoClient } = await import("mongodb");
  const configType = String(credentials.configurationType ?? "connectionString");
  let uri: string;
  let dbName: string;

  if (configType === "connectionString") {
    uri = String(credentials.connectionString ?? "mongodb://localhost:27017");
    dbName = String(credentials.database ?? "test");
  } else {
    const host = String(credentials.host ?? "localhost");
    const port = Number(credentials.port ?? 27017);
    const user = String(credentials.user ?? "");
    const password = String(credentials.password ?? "");
    const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : "";
    uri = `mongodb://${auth}${host}:${port}`;
    dbName = String(credentials.database ?? "test");
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  return {
    db: () => db,
    close: () => client.close(),
  };
};

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

function getFields(fieldsParam: string): string[] {
  if (!fieldsParam) return [];
  return fieldsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractFieldsFromItem(item: INodeExecutionData, fields: string[]): Record<string, unknown> {
  if (fields.length === 0) return { ...item.json };
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in item.json) out[f] = item.json[f];
  }
  return out;
}

function parseDateFields(doc: Record<string, unknown>, dateFields: string[], useDotNotation: boolean): Record<string, unknown> {
  if (!dateFields.length) return doc;
  const out = { ...doc };
  for (const f of dateFields) {
    const key = useDotNotation ? f : f;
    const parts = useDotNotation ? f.split(".") : [f];
    let target = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (target[part] && typeof target[part] === "object") {
        target = target[part] as Record<string, unknown>;
      }
    }
    const lastKey = parts[parts.length - 1];
    if (lastKey in target && typeof target[lastKey] === "string") {
      target[lastKey] = new Date(target[lastKey] as string);
    }
  }
  return out;
}

export const mongoDbExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const resource = ctx.getParam<string>("resource", "document");
  const operation = ctx.getParam<string>("operation", "find");
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("mongoDb");
  if (!credentials) {
    throw new Error('MongoDB: credential "mongoDb" is not configured on this node');
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials);

  try {
    const collection = ctx.getParam<string>("collection", "");

    if (resource === "document") {
      return await executeDocumentOperation(ctx, client, collection, operation, items, continueOnFail);
    } else if (resource === "searchIndexes") {
      return await executeSearchIndexOperation(ctx, client, collection, operation, items, continueOnFail);
    }
    throw new Error(`MongoDB: unknown resource "${resource}"`);
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
  const dbName = ctx.getParam<string>("database", "");

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const resolvedCollection = String(resolveValue(collection, item.json, index) ?? collection);
      const db = dbName ? client.db(dbName) : client.db("");
      const col = db.collection(resolvedCollection);

      switch (operation) {
        case "find": {
          const query = parseJson(ctx.getParam("query", "{}"), item.json, index) as Record<string, unknown>;
          const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
          const limit = Number(options.limit ?? 0);
          const skip = Number(options.skip ?? 0);
          const sort = parseJson(options.sort ?? "{}", item.json, index) as Record<string, unknown>;
          const projection = parseJson(options.projection ?? "{}", item.json, index) as Record<string, unknown>;

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
          const fields = getFields(ctx.getParam<string>("fields", ""));
          const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
          const dateFields = getFields(String(options.dateFields ?? ""));
          const useDotNotation = Boolean(options.useDotNotation);

          const doc = extractFieldsFromItem(item, fields);
          const parsed = parseDateFields(doc, dateFields, useDotNotation);
          const result = await col.insertOne(parsed);
          out.push({
            json: { ...parsed, _id: result.insertedId } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "update": {
          const updateKey = ctx.getParam<string>("updateKey", "id");
          const fields = getFields(ctx.getParam<string>("fields", ""));
          const upsert = Boolean(ctx.getParam("upsert", false));
          const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
          const dateFields = getFields(String(options.dateFields ?? ""));
          const useDotNotation = Boolean(options.useDotNotation);

          const matchVal = item.json[updateKey];
          const doc = extractFieldsFromItem(item, fields);
          const parsed = parseDateFields(doc, dateFields, useDotNotation);
          const result = await col.updateMany(
            { [updateKey]: matchVal } as Record<string, unknown>,
            { $set: parsed } as Record<string, unknown>,
            { upsert },
          );
          out.push({
            json: { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "delete": {
          const query = parseJson(ctx.getParam("query", "{}"), item.json, index) as Record<string, unknown>;
          const result = await col.deleteMany(query);
          out.push({
            json: { deletedCount: result.deletedCount } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "aggregate": {
          const query = parseJsonArray(ctx.getParam("query", "[]"), item.json, index);
          const docs = await col.aggregate(query);
          for (const doc of docs) {
            out.push({
              json: doc as Record<string, unknown>,
              pairedItem: item.pairedItem ?? { item: index, input: 0 },
            });
          }
          break;
        }
        case "findOneAndUpdate": {
          const updateKey = ctx.getParam<string>("updateKey", "id");
          const fields = getFields(ctx.getParam<string>("fields", ""));
          const upsert = Boolean(ctx.getParam("upsert", false));
          const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
          const dateFields = getFields(String(options.dateFields ?? ""));
          const useDotNotation = Boolean(options.useDotNotation);

          const matchVal = item.json[updateKey];
          const doc = extractFieldsFromItem(item, fields);
          const parsed = parseDateFields(doc, dateFields, useDotNotation);
          const updated = await col.findOneAndUpdate(
            { [updateKey]: matchVal } as Record<string, unknown>,
            { $set: parsed } as Record<string, unknown>,
            { upsert, returnDocument: "after" },
          );
          out.push({
            json: (updated ?? {}) as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "findOneAndReplace": {
          const updateKey = ctx.getParam<string>("updateKey", "id");
          const fields = getFields(ctx.getParam<string>("fields", ""));
          const upsert = Boolean(ctx.getParam("upsert", false));
          const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
          const dateFields = getFields(String(options.dateFields ?? ""));
          const useDotNotation = Boolean(options.useDotNotation);

          const matchVal = item.json[updateKey];
          const doc = extractFieldsFromItem(item, fields);
          const parsed = parseDateFields(doc, dateFields, useDotNotation);
          const replaced = await col.findOneAndReplace(
            { [updateKey]: matchVal } as Record<string, unknown>,
            parsed,
            { upsert, returnDocument: "after" },
          );
          out.push({
            json: (replaced ?? {}) as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        default:
          throw new Error(`MongoDB: unknown document operation "${operation}"`);
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
  const dbName = ctx.getParam<string>("database", "");

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const resolvedCollection = String(resolveValue(collection, item.json, index) ?? collection);
      const db = dbName ? client.db(dbName) : client.db("");
      const col = db.collection(resolvedCollection);

      switch (operation) {
        case "createSearchIndex": {
          const indexName = String(ctx.getParam("indexNameRequired", ""));
          const indexDefinition = parseJson(ctx.getParam("indexDefinition", "{}"), item.json, index) as Record<string, unknown>;
          const indexType = ctx.getParam<string>("indexType", "vectorSearch");
          const result = await col.createSearchIndex(indexName, indexDefinition, indexType);
          out.push({
            json: { indexName: result } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "dropSearchIndex": {
          const indexName = String(ctx.getParam("indexNameRequired", ""));
          await col.dropSearchIndex(indexName);
          out.push({
            json: { success: true } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        case "listSearchIndexes": {
          const indexName = ctx.getParam<string>("indexName", "");
          const indexes = await col.listSearchIndexes(indexName || undefined);
          for (const idx of indexes) {
            out.push({
              json: idx as Record<string, unknown>,
              pairedItem: item.pairedItem ?? { item: index, input: 0 },
            });
          }
          break;
        }
        case "updateSearchIndex": {
          const indexName = String(ctx.getParam("indexNameRequired", ""));
          const indexDefinition = parseJson(ctx.getParam("indexDefinition", "{}"), item.json, index) as Record<string, unknown>;
          await col.updateSearchIndex(indexName, indexDefinition);
          out.push({
            json: { success: true } as Record<string, unknown>,
            pairedItem: item.pairedItem ?? { item: index, input: 0 },
          });
          break;
        }
        default:
          throw new Error(`MongoDB: unknown search index operation "${operation}"`);
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
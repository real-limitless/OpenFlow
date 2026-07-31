import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import type { CredentialData } from "@/lib/engine/credentials";
import { evaluateExpression } from "../../expressions/evaluate";

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<"OK" | null>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  info(section?: string): Promise<string>;
  keys(pattern: string): Promise<string[]>;
  type(key: string): Promise<string>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, data: Record<string, string>): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  smembers(key: string): Promise<string[]>;
  llen(key: string): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lpop(key: string): Promise<string | null>;
  rpop(key: string): Promise<string | null>;
  publish(channel: string, message: string): Promise<number>;
  quit(): Promise<void>;
}

export type RedisClientFactory = (credentials: CredentialData) => Promise<RedisClient>;

let clientFactory: RedisClientFactory | null = null;

export function setRedisClientFactory(factory: RedisClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: RedisClientFactory = async (credentials) => {
  const { default: Redis } = await import("ioredis");
  const host = String(credentials.host ?? "localhost");
  const port = Number(credentials.port ?? 6379);
  const db = Number(credentials.database ?? 0);
  const password = credentials.password != null && credentials.password !== ""
    ? String(credentials.password)
    : undefined;
  const username =
    credentials.user != null && String(credentials.user) !== ""
      ? String(credentials.user)
      : undefined;
  const useTls = Boolean(credentials.ssl);
  const rejectUnauthorized = !Boolean(credentials.disableTlsVerification);

  const client = new Redis({
    host,
    port,
    db,
    password,
    username,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    ...(useTls
      ? { tls: { rejectUnauthorized } }
      : {}),
  });

  await client.connect();

  return {
    get: (key) => client.get(key),
    set: (key, value) => client.set(key, value),
    del: (key) => client.del(key),
    incr: (key) => client.incr(key),
    expire: (key, seconds) => client.expire(key, seconds),
    info: (section) => (section ? client.info(section) : client.info()),
    keys: (pattern) => client.keys(pattern),
    type: (key) => client.type(key),
    hgetall: (key) => client.hgetall(key),
    hset: async (key, data) => {
      if (Object.keys(data).length === 0) return 0;
      return client.hset(key, data);
    },
    lrange: (key, start, stop) => client.lrange(key, start, stop),
    smembers: (key) => client.smembers(key),
    llen: (key) => client.llen(key),
    lpush: (key, ...values) => client.lpush(key, ...values),
    rpush: (key, ...values) => client.rpush(key, ...values),
    lpop: (key) => client.lpop(key),
    rpop: (key) => client.rpop(key),
    publish: (channel, message) => client.publish(channel, message),
    quit: async () => {
      await client.quit().catch(() => {
        client.disconnect();
      });
    },
  };
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function str(raw: unknown, itemJson: Record<string, unknown>, fallback = ""): string {
  const v = resolveValue(raw, itemJson);
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function bool(raw: unknown, itemJson: Record<string, unknown>, fallback = false): boolean {
  const v = resolveValue(raw, itemJson);
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0" || lower === "") return false;
  }
  return Boolean(v);
}

function num(raw: unknown, itemJson: Record<string, unknown>, fallback: number): number {
  const v = resolveValue(raw, itemJson);
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function requireParam(name: string, value: string): string {
  if (!value) {
    throw new Error(`Redis: required parameter "${name}" is missing`);
  }
  return value;
}

function parseRedisValue(raw: string | null): unknown {
  if (raw === null) return null;
  if (raw === "") return "";
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isSafeInteger(n)) return n;
  }
  if (/^-?\d+\.\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      /* keep string */
    }
  }
  return raw;
}

function setProperty(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
  useDot: boolean,
): void {
  if (!useDot || !path.includes(".")) {
    target[path] = value;
    return;
  }
  const parts = path.split(".");
  let cur: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function cloneItem(item: INodeExecutionData): INodeExecutionData {
  return {
    json: { ...item.json },
    ...(item.binary ? { binary: item.binary } : {}),
    ...(item.pairedItem !== undefined ? { pairedItem: item.pairedItem } : {}),
  };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function getValueByType(
  client: RedisClient,
  key: string,
  keyType: string,
): Promise<unknown> {
  let type = keyType;
  if (type === "automatic" || !type) {
    type = await client.type(key);
  }
  switch (type) {
    case "none":
      return null;
    case "hash": {
      const hash = await client.hgetall(key);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(hash)) {
        out[k] = parseRedisValue(v);
      }
      return out;
    }
    case "list": {
      const list = await client.lrange(key, 0, -1);
      return list.map((v) => parseRedisValue(v));
    }
    case "set":
    case "sets": {
      const members = await client.smembers(key);
      return members.map((v) => parseRedisValue(v));
    }
    case "string":
    default: {
      const raw = await client.get(key);
      return parseRedisValue(raw);
    }
  }
}

async function setKeyValue(
  client: RedisClient,
  key: string,
  valueRaw: string,
  keyType: string,
  valueIsJSON: boolean,
): Promise<void> {
  if (keyType === "hash") {
    let data: Record<string, string> = {};
    if (valueIsJSON) {
      try {
        const parsed = JSON.parse(valueRaw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            data[k] = typeof v === "string" ? v : JSON.stringify(v);
          }
        } else {
          throw new Error("Redis: hash value JSON must be an object");
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Redis:")) throw err;
        throw new Error(`Redis: failed to parse hash value as JSON: ${errMessage(err)}`);
      }
    } else {
      // key=value pairs separated by space or newline — minimal support
      for (const part of valueRaw.split(/[\s,]+/).filter(Boolean)) {
        const eq = part.indexOf("=");
        if (eq === -1) continue;
        data[part.slice(0, eq)] = part.slice(eq + 1);
      }
    }
    await client.hset(key, data);
    return;
  }

  if (keyType === "list") {
    await client.rpush(key, valueRaw);
    return;
  }

  if (keyType === "sets" || keyType === "set") {
    // TODO: partial — set members via SADD not fully specified; store as string
    await client.set(key, valueRaw);
    return;
  }

  await client.set(key, valueRaw);
}

export const redisExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("redis");
  if (!credentials) {
    throw new Error('Redis: credential "redis" is not configured on this node');
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials);

  try {
    const operation = ctx.getParam<string>("operation", "info");
    const out: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      try {
        const produced = await runOperation(ctx, client, item, i, operation);
        out.push(...produced);
      } catch (err) {
        if (!continueOnFail) {
          throw err instanceof Error ? err : new Error(errMessage(err));
        }
        out.push({
          json: {
            ...item.json,
            error: errMessage(err),
          },
          pairedItem: { item: i, input: 0 },
        });
      }
    }

    return [out];
  } finally {
    await client.quit().catch(() => {});
  }
};

async function runOperation(
  ctx: ExecutionContext,
  client: RedisClient,
  item: INodeExecutionData,
  itemIndex: number,
  operation: string,
): Promise<INodeExecutionData[]> {
  const json = item.json ?? {};
  const options = asRecord(ctx.getParam("options", {}));
  const useDot = options.dotNotation !== false;

  switch (operation) {
    case "get": {
      const key = requireParam("key", str(ctx.getParam("key", ""), json));
      const propertyName = str(ctx.getParam("propertyName", "propertyName"), json, "propertyName");
      const keyType = str(ctx.getParam("keyType", "automatic"), json, "automatic");
      const value = await getValueByType(client, key, keyType);
      const next = cloneItem(item);
      setProperty(next.json, propertyName || "propertyName", value, useDot);
      next.pairedItem = { item: itemIndex, input: 0 };
      return [next];
    }

    case "set": {
      const key = requireParam("key", str(ctx.getParam("key", ""), json));
      const value = str(ctx.getParam("value", ""), json);
      const keyType = str(ctx.getParam("keyType", "string"), json, "string");
      const valueIsJSON = bool(ctx.getParam("valueIsJSON", true), json, true);
      const expire = bool(ctx.getParam("expire", false), json, false);
      const ttl = Math.max(1, Math.floor(num(ctx.getParam("ttl", 60), json, 60)));
      await setKeyValue(client, key, value, keyType, valueIsJSON);
      if (expire) {
        await client.expire(key, ttl);
      }
      const next = cloneItem(item);
      next.pairedItem = { item: itemIndex, input: 0 };
      return [next];
    }

    case "delete": {
      const key = requireParam("key", str(ctx.getParam("key", ""), json));
      const deleted = await client.del(key);
      const next = cloneItem(item);
      next.json = { ...next.json, deleted };
      next.pairedItem = { item: itemIndex, input: 0 };
      return [next];
    }

    case "incr": {
      const key = requireParam("key", str(ctx.getParam("key", ""), json));
      const expire = bool(ctx.getParam("expire", false), json, false);
      const ttl = Math.max(1, Math.floor(num(ctx.getParam("ttl", 60), json, 60)));
      const value = await client.incr(key);
      if (expire) {
        await client.expire(key, ttl);
      }
      const next = cloneItem(item);
      next.json = { ...next.json, [key]: value };
      next.pairedItem = { item: itemIndex, input: 0 };
      return [next];
    }

    case "info": {
      const raw = await client.info();
      const next = cloneItem(item);
      next.json = { ...next.json, info: raw };
      next.pairedItem = { item: itemIndex, input: 0 };
      return [next];
    }

    case "keys": {
      const keyPattern = requireParam("keyPattern", str(ctx.getParam("keyPattern", ""), json));
      const getValues = bool(ctx.getParam("getValues", true), json, true);
      const matched = await client.keys(keyPattern);
      const results: INodeExecutionData[] = [];
      for (const key of matched) {
        const entry: Record<string, unknown> = { key };
        if (getValues) {
          entry.value = await getValueByType(client, key, "automatic");
        }
        results.push({
          json: entry,
          pairedItem: { item: itemIndex, input: 0 },
        });
      }
      return results;
    }

    case "llen": {
      const list = requireParam("list", str(ctx.getParam("list", ""), json));
      const length = await client.llen(list);
      const next = cloneItem(item);
      next.json = { ...next.json, llen: length };
      next.pairedItem = { item: itemIndex, input: 0 };
      return [next];
    }

    case "push": {
      const list = requireParam("list", str(ctx.getParam("list", ""), json));
      const messageData = requireParam(
        "messageData",
        str(ctx.getParam("messageData", ""), json),
      );
      const tail = bool(ctx.getParam("tail", false), json, false);
      const length = tail
        ? await client.rpush(list, messageData)
        : await client.lpush(list, messageData);
      const next = cloneItem(item);
      next.json = { ...next.json, listLength: length };
      next.pairedItem = { item: itemIndex, input: 0 };
      return [next];
    }

    case "pop": {
      const list = requireParam("list", str(ctx.getParam("list", ""), json));
      const tail = bool(ctx.getParam("tail", false), json, false);
      const propertyName = str(ctx.getParam("propertyName", "propertyName"), json, "propertyName");
      const raw = tail ? await client.rpop(list) : await client.lpop(list);
      const value = parseRedisValue(raw);
      const next = cloneItem(item);
      setProperty(next.json, propertyName || "propertyName", value, useDot);
      next.pairedItem = { item: itemIndex, input: 0 };
      return [next];
    }

    case "publish": {
      const channel = requireParam("channel", str(ctx.getParam("channel", ""), json));
      const messageData = requireParam(
        "messageData",
        str(ctx.getParam("messageData", ""), json),
      );
      const count = await client.publish(channel, messageData);
      const next = cloneItem(item);
      next.json = { ...next.json, count };
      next.pairedItem = { item: itemIndex, input: 0 };
      return [next];
    }

    default:
      throw new Error(`Redis: unknown operation "${operation}"`);
  }
}

import type { NodeExecutor, INodeExecutionData, ExecutionContext, CredentialData } from "@/sdk";
import { ensureItems } from "@/sdk";
import type { RedisClient, RedisClientFactory } from "./redis";
import { setRedisClientFactory } from "./redis";

let clientFactory: RedisClientFactory | null = null;

export function setRedisToolClientFactory(factory: RedisClientFactory | null): void {
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
    ...(useTls ? { tls: { rejectUnauthorized } } : {}),
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

function str(raw: unknown, fallback = ""): string {
  if (raw === undefined || raw === null) return fallback;
  return String(raw);
}

function requireParam(name: string, value: string): string {
  if (!value) {
    throw new Error(`Redis Tool: required parameter "${name}" is missing`);
  }
  return value;
}

function cloneItem(item: INodeExecutionData, itemIndex: number): INodeExecutionData {
  return {
    json: { ...item.json },
    ...(item.binary ? { binary: item.binary } : {}),
    pairedItem: { item: itemIndex, input: 0 },
  };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function runOperation(
  ctx: ExecutionContext,
  client: RedisClient,
  item: INodeExecutionData,
  itemIndex: number,
): Promise<INodeExecutionData> {
  const operation = ctx.getParam<string>("operation", "get");
  const json = item.json ?? {};

  switch (operation) {
    case "delete": {
      const key = requireParam("key", str(ctx.getParam("key", "")));
      const deleted = await client.del(key);
      const next = cloneItem(item, itemIndex);
      next.json = { deleted };
      return next;
    }

    case "get": {
      const key = requireParam("key", str(ctx.getParam("key", "")));
      const raw = await client.get(key);
      const next = cloneItem(item, itemIndex);
      next.json = { value: raw };
      return next;
    }

    case "info": {
      const raw = await client.info();
      const next = cloneItem(item, itemIndex);
      next.json = { info: raw };
      return next;
    }

    case "increment": {
      const key = requireParam("key", str(ctx.getParam("key", "")));
      const value = await client.incr(key);
      const next = cloneItem(item, itemIndex);
      next.json = { value };
      return next;
    }

    case "keys": {
      const pattern = requireParam("pattern", str(ctx.getParam("pattern", "*")));
      const matched = await client.keys(pattern);
      const next = cloneItem(item, itemIndex);
      next.json = { keys: matched };
      return next;
    }

    case "set": {
      const key = requireParam("key", str(ctx.getParam("key", "")));
      const value = requireParam("value", str(ctx.getParam("value", "")));
      await client.set(key, value);
      const next = cloneItem(item, itemIndex);
      next.json = { status: "OK" };
      return next;
    }

    case "publish": {
      const channel = requireParam("channel", str(ctx.getParam("channel", "")));
      const message = requireParam("message", str(ctx.getParam("message", "")));
      const subscribers = await client.publish(channel, message);
      const next = cloneItem(item, itemIndex);
      next.json = { subscribers };
      return next;
    }

    default:
      throw new Error(`Redis Tool: unknown operation "${operation}"`);
  }
}

export const redisToolExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("redis");
  if (!credentials) {
    throw new Error('Redis Tool: credential "redis" is not configured on this node');
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials);

  try {
    const out: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      try {
        const produced = await runOperation(ctx, client, item, i);
        out.push(produced);
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

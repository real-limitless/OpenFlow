import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import type { CredentialData } from "@/lib/engine/credentials";

export interface MemoryChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface MemoryInteraction {
  user: MemoryChatMessage;
  assistant: MemoryChatMessage;
}

interface RedisChatClient {
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  lpush(key: string, ...values: string[]): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<"OK" | null>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
  llen(key: string): Promise<number>;
  quit(): Promise<void>;
}

export type RedisChatClientFactory = (credentials: CredentialData) => Promise<RedisChatClient>;

let clientFactory: RedisChatClientFactory | null = null;

export function setRedisChatClientFactory(factory: RedisChatClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: RedisChatClientFactory = async (credentials) => {
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
    lrange: (key, start, stop) => client.lrange(key, start, stop),
    lpush: (key, ...values) => client.lpush(key, ...values),
    ltrim: (key, start, stop) => client.ltrim(key, start, stop),
    expire: (key, seconds) => client.expire(key, seconds),
    del: (key) => client.del(key),
    llen: (key) => client.llen(key),
    quit: async () => {
      await client.quit().catch(() => { client.disconnect(); });
    },
  };
};

function firstItemJson(ctx: ExecutionContext): Record<string, unknown> {
  const items = ctx.getInputItems(0);
  return items[0]?.json ?? {};
}

function resolveSessionId(ctx: ExecutionContext): string {
  const raw = ctx.getParam<unknown>("sessionId", "");
  let sessionId = "";
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      const resolved = ctx.evaluate(raw, firstItemJson(ctx));
      sessionId = String(resolved ?? "").trim();
    } else {
      sessionId = raw.trim();
    }
  }
  if (!sessionId) {
    const auto = (firstItemJson(ctx) as { sessionId?: unknown }).sessionId;
    if (auto != null) sessionId = String(auto).trim();
  }
  if (!sessionId) {
    throw new Error("No sessionId");
  }
  return sessionId;
}

function resolveContextWindowLength(ctx: ExecutionContext): number {
  const raw = ctx.getParam<unknown>("contextWindowLength", 0);
  let n: number;
  if (typeof raw === "string" && raw.startsWith("=")) {
    n = Number(ctx.evaluate(raw, firstItemJson(ctx)) ?? 0);
  } else {
    n = Number(raw ?? 0);
  }
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function resolveSessionTTL(ctx: ExecutionContext): number {
  const raw = ctx.getParam<unknown>("sessionTTL", 0);
  let n: number;
  if (typeof raw === "string" && raw.startsWith("=")) {
    n = Number(ctx.evaluate(raw, firstItemJson(ctx)) ?? 0);
  } else {
    n = Number(raw ?? 0);
  }
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n);
}

function serializeMessage(msg: MemoryChatMessage): string {
  return JSON.stringify(msg);
}

function deserializeMessage(raw: string): MemoryChatMessage {
  const parsed = JSON.parse(raw) as { role?: string; content?: string };
  return {
    role: (parsed.role ?? "user") as MemoryChatMessage["role"],
    content: parsed.content ?? "",
  };
}

function sessionKey(sessionId: string): string {
  return `chat_memory:${sessionId}`;
}

async function loadMessages(
  client: RedisChatClient,
  sessionId: string,
  contextWindowLength: number,
): Promise<MemoryChatMessage[]> {
  const key = sessionKey(sessionId);
  const total = await client.llen(key);
  if (total === 0) return [];

  if (contextWindowLength <= 0) return [];

  const limit = contextWindowLength * 2;
  const end = limit - 1;
  const raw = await client.lrange(key, 0, end < total ? end : total - 1);
  const messages = raw.map(deserializeMessage);
  return messages.reverse();
}

async function appendTurn(
  client: RedisChatClient,
  sessionId: string,
  userMsg: MemoryChatMessage,
  assistantMsg: MemoryChatMessage,
  ttl: number,
): Promise<void> {
  const key = sessionKey(sessionId);
  await client.lpush(key, serializeMessage(assistantMsg), serializeMessage(userMsg));
  if (ttl > 0) {
    await client.expire(key, ttl);
  }
}

async function saveMessages(
  client: RedisChatClient,
  sessionId: string,
  messages: MemoryChatMessage[],
  ttl: number,
): Promise<void> {
  const key = sessionKey(sessionId);
  await client.del(key);
  if (messages.length === 0) return;
  const serialized = messages.map(serializeMessage);
  await client.lpush(key, ...serialized.reverse());
  if (ttl > 0) {
    await client.expire(key, ttl);
  }
}

export const memoryRedisChatExecutor: NodeExecutor = async (ctx) => {
  const sessionId = resolveSessionId(ctx);
  const contextWindowLength = resolveContextWindowLength(ctx);
  const sessionTTL = resolveSessionTTL(ctx);

  const credentials = await ctx.getCredential("redis");
  if (!credentials) {
    throw new Error("Redis Chat Memory: credential \"redis\" is not configured on this node");
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const loadClient = await factory(credentials);
  await loadClient.quit();

  const handle: Record<string, unknown> = {
    type: "@n8n/n8n-nodes-langchain.memoryRedisChat",
    sessionId,
    contextWindowLength,
    sessionTTL,
    loadMessages: async (): Promise<MemoryChatMessage[]> => {
      const client = await factory(credentials);
      try {
        return await loadMessages(client, sessionId, contextWindowLength);
      } finally {
        await client.quit().catch(() => {});
      }
    },
    saveMessages: async (messages: MemoryChatMessage[]): Promise<void> => {
      const client = await factory(credentials);
      try {
        await saveMessages(client, sessionId, messages, sessionTTL);
      } finally {
        await client.quit().catch(() => {});
      }
    },
    appendTurn: async (userMsg: MemoryChatMessage, assistantMsg: MemoryChatMessage): Promise<void> => {
      const client = await factory(credentials);
      try {
        await appendTurn(client, sessionId, userMsg, assistantMsg, sessionTTL);
      } finally {
        await client.quit().catch(() => {});
      }
    },
  };

  const out: INodeExecutionData[] = [{ json: handle as unknown as Record<string, unknown> }];
  return [out];
};

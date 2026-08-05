import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";

export interface MemoryChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface MemoryInteraction {
  user: MemoryChatMessage;
  assistant: MemoryChatMessage;
}

interface MongoCollection {
  find(filter: Record<string, unknown>): {
    sort(sort: Record<string, number>): {
      toArray(): Promise<Record<string, unknown>[]>;
    };
  };
  insertMany(docs: Record<string, unknown>[]): Promise<unknown>;
  deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
}

interface MongoDbClient {
  collection(name: string): MongoCollection;
  db(name: string): { collection(name: string): MongoCollection };
  close(): Promise<void>;
}

export type MongoDbChatClientFactory = (
  credentials: Record<string, unknown>,
) => Promise<MongoDbClient>;

let clientFactory: MongoDbChatClientFactory | null = null;

export function setMongoDbChatClientFactory(factory: MongoDbChatClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: MongoDbChatClientFactory = async (credentials) => {
  const c = credentials as Record<string, unknown>;
  const cfg = c.configuration as Record<string, unknown> | undefined;
  const url = String(
    cfg?.connectionString ?? c.connectionString ?? c.url ?? "mongodb://localhost:27017",
  );
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(url);
  await client.connect();
  return client as unknown as MongoDbClient;
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
  const raw = ctx.getParam<unknown>("contextWindowLength", 5);
  let n: number;
  if (typeof raw === "string" && raw.startsWith("=")) {
    n = Number(ctx.evaluate(raw, firstItemJson(ctx)) ?? 0);
  } else {
    n = Number(raw ?? 5);
  }
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function getCollection(
  client: MongoDbClient,
  databaseName: string,
  collectionName: string,
): MongoCollection {
  if (databaseName) {
    return client.db(databaseName).collection(collectionName);
  }
  return client.collection(collectionName);
}

async function loadInteractions(
  col: MongoCollection,
  sessionId: string,
  contextWindowLength: number,
): Promise<MemoryChatMessage[]> {
  const limit = contextWindowLength > 0 ? contextWindowLength * 2 : 0;
  if (limit <= 0) return [];

  const docs = await col.find({ sessionId }).sort({ createdAt: 1 }).toArray();

  const allMessages = docs.map((r) => ({
    role: String(r.role) as MemoryChatMessage["role"],
    content: String(r.content),
  }));

  if (allMessages.length <= limit) return allMessages;
  return allMessages.slice(allMessages.length - limit);
}

export const memoryMongoDbChatExecutor: NodeExecutor = async (ctx) => {
  const sessionId = resolveSessionId(ctx);
  const contextWindowLength = resolveContextWindowLength(ctx);
  const collectionName = ctx.getParam<string>("collectionName", "chat_history");
  const databaseName = ctx.getParam<string>("databaseName", "");

  const credentials = await ctx.getCredential("mongoDb");
  if (!credentials) {
    throw new Error(
      "MongoDB Chat Memory: credential \"mongoDb\" is not configured on this node",
    );
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;

  const handle: Record<string, unknown> = {
    type: "@n8n/n8n-nodes-langchain.memoryMongoDbChat",
    sessionId,
    collectionName,
    databaseName,
    contextWindowLength,
    loadMessages: async (): Promise<MemoryChatMessage[]> => {
      const client = await factory(credentials);
      try {
        const col = getCollection(client, databaseName, collectionName);
        return await loadInteractions(col, sessionId, contextWindowLength);
      } finally {
        await client.close().catch(() => {});
      }
    },
    saveMessages: async (messages: MemoryChatMessage[]): Promise<void> => {
      const client = await factory(credentials);
      try {
        const col = getCollection(client, databaseName, collectionName);
        await col.deleteMany({ sessionId });
        if (messages.length === 0) return;
        const now = new Date().toISOString();
        const docs = messages.map((m) => ({
          sessionId,
          role: m.role,
          content: m.content,
          createdAt: now,
        }));
        await col.insertMany(docs);
      } finally {
        await client.close().catch(() => {});
      }
    },
    appendTurn: async (
      userMsg: MemoryChatMessage,
      assistantMsg: MemoryChatMessage,
    ): Promise<void> => {
      const client = await factory(credentials);
      try {
        const col = getCollection(client, databaseName, collectionName);
        const now = new Date().toISOString();
        await col.insertMany([
          { sessionId, role: userMsg.role, content: userMsg.content, createdAt: now },
          { sessionId, role: assistantMsg.role, content: assistantMsg.content, createdAt: now },
        ]);
      } finally {
        await client.close().catch(() => {});
      }
    },
  };

  const out: INodeExecutionData[] = [{ json: handle as unknown as Record<string, unknown> }];
  return [out];
};

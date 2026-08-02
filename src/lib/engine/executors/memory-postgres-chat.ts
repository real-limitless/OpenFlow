import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";

export interface MemoryChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface MemoryInteraction {
  user: MemoryChatMessage;
  assistant: MemoryChatMessage;
}

interface PostgresQueryResult {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
}

interface PostgresClient {
  query(sql: string, params?: unknown[]): Promise<PostgresQueryResult>;
  end(): Promise<void>;
}

export type PostgresClientFactory = (
  credentials: Record<string, unknown>,
  options: Record<string, unknown>,
) => Promise<PostgresClient>;

let clientFactory: PostgresClientFactory | null = null;

export function setPostgresClientFactory(factory: PostgresClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: PostgresClientFactory = async (credentials, options) => {
  const { default: pg } = await import("pg");
  const Client = pg.Client;
  const sslMode = String(credentials.ssl ?? credentials.sslMode ?? "disable");
  const ssl =
    sslMode === "disable" || sslMode === "false"
      ? undefined
      : sslMode === "require" || sslMode === "allow"
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true };

  const client = new Client({
    host: String(credentials.host ?? "localhost"),
    port: Number(credentials.port ?? 5432),
    user: String(credentials.user ?? credentials.username ?? "postgres"),
    password: String(credentials.password ?? ""),
    database: String(credentials.database ?? credentials.db ?? "postgres"),
    connectionTimeoutMillis: Number(options.connectionTimeout ?? 30) * 1000,
    ssl,
  });
  await client.connect();

  return {
    async query(sql, params) {
      const result = await client.query(sql, params);
      return {
        rows: result.rows as Record<string, unknown>[],
        rowCount: result.rowCount,
      };
    },
    async end() {
      await client.end();
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

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function autoCreateTable(client: PostgresClient, tableName: string): Promise<void> {
  const qt = quoteIdent(tableName);
  await client.query(`CREATE TABLE IF NOT EXISTS ${qt} (
    "id" SERIAL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  const bareIndex = `idx_${tableName.replace(/[^a-zA-Z0-9_]/g, "_")}_session`;
  await client.query(`CREATE INDEX IF NOT EXISTS ${bareIndex} ON ${qt} ("sessionId")`);
}

async function loadInteractions(
  client: PostgresClient,
  tableName: string,
  sessionId: string,
  contextWindowLength: number,
): Promise<MemoryChatMessage[]> {
  const qt = quoteIdent(tableName);
  const limit = contextWindowLength > 0 ? contextWindowLength * 2 : 0;

  if (limit <= 0) {
    return [];
  }

  const result = await client.query(
    `SELECT "role", "content" FROM ${qt} WHERE "sessionId" = $1 ORDER BY "id" ASC`,
    [sessionId],
  );

  const allMessages = result.rows.map((r) => ({
    role: String(r.role) as MemoryChatMessage["role"],
    content: String(r.content),
  }));

  if (allMessages.length <= limit) {
    return allMessages;
  }

  return allMessages.slice(allMessages.length - limit);
}

async function appendTurnToPostgres(
  client: PostgresClient,
  tableName: string,
  sessionId: string,
  userMsg: MemoryChatMessage,
  assistantMsg: MemoryChatMessage,
): Promise<void> {
  const qt = quoteIdent(tableName);
  await client.query(
    `INSERT INTO ${qt} ("sessionId", "role", "content") VALUES ($1, $2, $3), ($4, $5, $6)`,
    [sessionId, userMsg.role, userMsg.content, sessionId, assistantMsg.role, assistantMsg.content],
  );
}

async function saveMessagesToPostgres(
  client: PostgresClient,
  tableName: string,
  sessionId: string,
  messages: MemoryChatMessage[],
): Promise<void> {
  const qt = quoteIdent(tableName);
  await client.query(`DELETE FROM ${qt} WHERE "sessionId" = $1`, [sessionId]);

  if (messages.length === 0) return;

  const placeholders: string[] = [];
  const params: unknown[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const base = i * 3;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    params.push(sessionId, m.role, m.content);
  }
  await client.query(
    `INSERT INTO ${qt} ("sessionId", "role", "content") VALUES ${placeholders.join(", ")}`,
    params,
  );
}

export const memoryPostgresChatExecutor: NodeExecutor = async (ctx) => {
  const sessionId = resolveSessionId(ctx);
  const contextWindowLength = resolveContextWindowLength(ctx);
  const tableName = ctx.getParam<string>("tableName", "chat_history");

  const credentials = await ctx.getCredential("postgres");
  if (!credentials) {
    throw new Error("Postgres Chat Memory: credential \"postgres\" is not configured on this node");
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const loadClient = await factory(credentials, options);
  await autoCreateTable(loadClient, tableName);
  await loadClient.end();

  const handle: Record<string, unknown> = {
    type: "@n8n/n8n-nodes-langchain.memoryPostgresChat",
    sessionId,
    tableName,
    contextWindowLength,
    loadMessages: async (): Promise<MemoryChatMessage[]> => {
      const client = await factory(credentials, options);
      try {
        return await loadInteractions(client, tableName, sessionId, contextWindowLength);
      } finally {
        await client.end().catch(() => {});
      }
    },
    saveMessages: async (messages: MemoryChatMessage[]): Promise<void> => {
      const client = await factory(credentials, options);
      try {
        await saveMessagesToPostgres(client, tableName, sessionId, messages);
      } finally {
        await client.end().catch(() => {});
      }
    },
    appendTurn: async (userMsg: MemoryChatMessage, assistantMsg: MemoryChatMessage): Promise<void> => {
      const client = await factory(credentials, options);
      try {
        await appendTurnToPostgres(client, tableName, sessionId, userMsg, assistantMsg);
      } finally {
        await client.end().catch(() => {});
      }
    },
  };

  const out: INodeExecutionData[] = [{ json: handle as unknown as Record<string, unknown> }];
  return [out];
};

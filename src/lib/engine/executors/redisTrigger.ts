import type { NodeExecutor, INodeExecutionData } from "@/sdk";

/**
 * Minimal Redis client interface for trigger (subscribe/publish).
 * Extended from the Redis action node's interface with subscribe support.
 */
export interface RedisTriggerClient {
  pSubscribe(pattern: string): Promise<void>;
  pUnsubscribe(pattern: string): Promise<void>;
  on(event: "message", handler: (channel: string, message: string) => void): void;
  on(event: "pmessage", handler: (pattern: string, channel: string, message: string) => void): void;
  removeAllListeners(event?: string): void;
  quit(): Promise<void>;
}

export type RedisTriggerClientFactory = (credentials: Record<string, unknown>) => Promise<RedisTriggerClient>;

let clientFactory: RedisTriggerClientFactory | null = null;

export function setRedisTriggerClientFactory(factory: RedisTriggerClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: RedisTriggerClientFactory = async (credentials) => {
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
  await client.ping();

  const handler: Record<string, (...args: unknown[]) => void> = {};

  return {
    async pSubscribe(pattern: string): Promise<void> {
      await client.psubscribe(pattern);
    },
    async pUnsubscribe(pattern: string): Promise<void> {
      await client.punsubscribe(pattern);
    },
    on(event: string, handlerFn: (...args: unknown[]) => void): void {
      handler[event] = handlerFn;
      client.on(event as "message", handlerFn as (...args: unknown[]) => void);
    },
    removeAllListeners(event?: string): void {
      if (event && handler[event]) {
        client.removeListener(event as "message", handler[event]);
        delete handler[event];
      } else {
        for (const [evt, fn] of Object.entries(handler)) {
          client.removeListener(evt as "message", fn);
        }
        for (const key of Object.keys(handler)) {
          delete handler[key];
        }
      }
    },
    async quit(): Promise<void> {
      this.removeAllListeners();
      await client.quit();
    },
  };
};

/**
 * Redis Trigger executor — emits items from subscribed Redis channels.
 *
 * Gaps (documented TODOs):
 * - Connection lifecycle (connect, subscribe, unsubscribe) is managed by the host,
 *   not in this executor. On activation the host calls `setRedisTriggerClientFactory`
 *   to supply a Redis client, subscribes via `pSubscribe`, and feeds inbound messages
 *   as input items. On deactivation it calls `pUnsubscribe` + `quit`.
 * - Manual trigger (first message then complete) — the host stops listening after
 *   emitting one item when in manual mode.
 * - Production trigger mode — the host keeps listening indefinitely.
 * - Expression evaluation on `channels` parameter — the host evaluates expressions
 *   before subscribing.
 */
export const redisTriggerExecutor: NodeExecutor = async (ctx) => {
  const channelsRaw = ctx.getParam<string>("channels", "");
  if (!channelsRaw || channelsRaw.trim() === "") {
    throw new Error("Channels parameter is required");
  }

  const options = ctx.getParam<Record<string, unknown>>("options", {});
  const jsonParseBody = Boolean(options.jsonParseBody);
  const onlyMessage = Boolean(options.onlyMessage);

  const inputItems = ctx.getInputItems(0);

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const channel = String(item.json.channel ?? "");
    const message = item.json.message;

    let parsedMessage: unknown = message;
    if (jsonParseBody && typeof message === "string") {
      try {
        parsedMessage = JSON.parse(message);
      } catch {
        parsedMessage = message;
      }
    }

    if (onlyMessage) {
      out.push({
        json: { message: parsedMessage },
        binary: item.binary ?? {},
      });
    } else {
      out.push({
        json: { channel, message: parsedMessage },
        binary: item.binary ?? {},
      });
    }
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  return [out];
};

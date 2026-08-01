import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import type { CredentialData } from "@/lib/engine/credentials";
import { evaluateExpression } from "../../expressions/evaluate";

export interface RabbitMqClient {
  send(exchange: string, routingKey: string, content: Buffer, options: Record<string, unknown>): Promise<void>;
  ack(deliveryTag: number): Promise<void>;
  quit(): Promise<void>;
}

export type RabbitMqClientFactory = (credentials: CredentialData) => Promise<RabbitMqClient>;

let clientFactory: RabbitMqClientFactory | null = null;

export function setRabbitMqClientFactory(factory: RabbitMqClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: RabbitMqClientFactory = async (_credentials) => {
  throw new Error(
    "RabbitMQ requires a client factory. Call setRabbitMqClientFactory() in your host environment.",
  );
};

function resolveExpression(raw: string, itemJson: Record<string, unknown>): string {
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? String(result.value) : raw;
  }
  return raw;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const TYPE = "n8n-nodes-base.rabbitmq";

export const rabbitmqExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("rabbitmq");
  if (!credentials) {
    throw new Error(`${TYPE}: credential "rabbitmq" is not configured on this node`);
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials);

  try {
    const operation = ctx.getParam<string>("operation", "sendMessage");
    const outputs: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const itemJson = item.json ?? {};

      try {
        if (operation === "sendMessage") {
          const mode = ctx.getParam<string>("mode", "queue");
          const exchange = resolveExpression(ctx.getParam<string>("exchange", "") ?? "", itemJson);
          const queue = resolveExpression(ctx.getParam<string>("queue", "") ?? "", itemJson);
          const routingKey = resolveExpression(ctx.getParam<string>("routingKey", "") ?? "", itemJson);
          const sendInputData = ctx.getParam<boolean>("sendInputData", true);
          const messageRaw = ctx.getParam<string>("message", "") ?? "";
          const options = ctx.getParam<Record<string, unknown>>("options", {});

          const message = sendInputData
            ? JSON.stringify(itemJson)
            : (messageRaw || "");

          const headersOpt = (options?.headers as Array<{ key: string; value: string }> | undefined) ?? [];
          const headers: Record<string, string> = {};
          for (const h of headersOpt) {
            if (h?.key) headers[h.key] = h.value;
          }

          const content = Buffer.from(message, "utf-8");
          const targetExchange = mode === "exchange" ? exchange : "";
          const targetRoutingKey = mode === "exchange" ? routingKey : queue;

          await client.send(targetExchange, targetRoutingKey, content, {
            contentType: String(options?.contentType ?? "text/plain"),
            headers,
            persistent: options?.durable !== false,
          });

          outputs.push({
            json: { ...item.json },
            ...(item.binary ? { binary: item.binary } : {}),
            pairedItem: { item: i, input: 0 },
          });
        } else if (operation === "deleteMessage") {
          const deliveryTag = itemJson?.fields?.deliveryTag;
          if (typeof deliveryTag === "number") {
            await client.ack(deliveryTag);
          }
          outputs.push({
            json: { ...item.json },
            ...(item.binary ? { binary: item.binary } : {}),
            pairedItem: { item: i, input: 0 },
          });
        } else {
          throw new Error(`${TYPE}: unknown operation "${operation}"`);
        }
      } catch (err) {
        if (!continueOnFail) {
          throw err instanceof Error ? err : new Error(errMessage(err));
        }
        outputs.push({
          json: { ...itemJson, error: errMessage(err) },
          pairedItem: { item: i, input: 0 },
        });
      }
    }

    return [outputs];
  } finally {
    await client.quit().catch(() => {});
  }
};

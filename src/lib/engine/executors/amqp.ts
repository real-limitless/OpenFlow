import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import type { CredentialData } from "@/lib/engine/credentials";
import { evaluateExpression } from "../../expressions/evaluate";

export interface AmqpClient {
  publish(exchange: string, routingKey: string, body: string): Promise<void>;
  quit(): Promise<void>;
}

export type AmqpClientFactory = (credentials: CredentialData) => Promise<AmqpClient>;

let clientFactory: AmqpClientFactory | null = null;

export function setAmqpClientFactory(factory: AmqpClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: AmqpClientFactory = async (_credentials) => {
  throw new Error(
    "AMQP requires a client factory. Call setAmqpClientFactory() in your host environment.",
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

export const amqpExecutor: NodeExecutor = async (ctx: ExecutionContext) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("amqp");
  if (!credentials) {
    throw new Error('AMQP: credential "amqp" is not configured on this node');
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials);

  try {
    const exchange = ctx.getParam<string>("exchange", "");
    const routingKey = ctx.getParam<string>("routingKey", "");
    const sendInputData = ctx.getParam<boolean>("sendInputData", true);
    const messageParam = ctx.getParam<string | undefined>("message", undefined);

    const outputs: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const itemJson = item.json ?? {};
      const resolvedExchange = resolveExpression(exchange, itemJson);
      const resolvedRoutingKey = resolveExpression(routingKey, itemJson);
      const payload = sendInputData
        ? JSON.stringify(itemJson)
        : resolveExpression(messageParam ?? "", itemJson);

      try {
        await client.publish(resolvedExchange, resolvedRoutingKey, payload);
        outputs.push({
          json: { ...item.json },
          ...(item.binary ? { binary: item.binary } : {}),
          pairedItem: { item: i, input: 0 },
        });
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

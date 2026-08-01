import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import type { CredentialData } from "@/lib/engine/credentials";
import { evaluateExpression } from "../../expressions/evaluate";

export interface MqttClient {
  publish(topic: string, payload: string, qos: number, retain: boolean): Promise<void>;
  quit(): Promise<void>;
}

export type MqttClientFactory = (credentials: CredentialData) => Promise<MqttClient>;

let clientFactory: MqttClientFactory | null = null;

export function setMqttClientFactory(factory: MqttClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: MqttClientFactory = async (credentials) => {
  const mqtt = await import("mqtt");
  const protocol = String(credentials.protocol ?? "mqtt");
  const host = String(credentials.host ?? "localhost");
  const port = Number(credentials.port ?? 1883);
  const clientId = credentials.clientId && String(credentials.clientId) !== ""
    ? String(credentials.clientId)
    : undefined;
  const clean = credentials.clean !== false;
  const username = credentials.username && String(credentials.username) !== ""
    ? String(credentials.username)
    : undefined;
  const password = credentials.password && String(credentials.password) !== ""
    ? String(credentials.password)
    : undefined;
  const useSsl = Boolean(credentials.ssl);

  const url = `${protocol}://${host}:${port}`;
  const client = await new Promise<mqtt.MqttClient>((resolve, reject) => {
    const c = mqtt.connect(url, {
      clientId,
      clean,
      username,
      password,
      ...(useSsl ? { rejectUnauthorized: Boolean(credentials.rejectUnauthorized) } : {}),
    });
    c.once("connect", () => resolve(c));
    c.once("error", reject);
    const timeout = setTimeout(() => reject(new Error("MQTT connection timeout")), 10000);
    c.once("connect", () => clearTimeout(timeout));
    c.once("error", () => clearTimeout(timeout));
  });

  return {
    async publish(topic, payload, qos, retain) {
      await new Promise<void>((resolve, reject) => {
        client.publish(topic, payload, { qos, retain }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    async quit() {
      await new Promise<void>((resolve) => {
        client.end(true, {}, resolve);
      });
    },
  };
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

function cloneItem(item: INodeExecutionData, idx: number): INodeExecutionData {
  return {
    json: { ...item.json },
    ...(item.binary ? { binary: item.binary } : {}),
    pairedItem: { item: idx, input: 0 },
  };
}

export const mqttExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("mqtt");
  if (!credentials) {
    throw new Error('MQTT: credential "mqtt" is not configured on this node');
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials);

  try {
    const topicParam = ctx.getParam<string>("topic", "");
    const sendInputData = ctx.getParam<boolean>("sendInputData", true);
    const messageParam = ctx.getParam<string | undefined>("message", undefined);
    const options = ctx.getParam<Record<string, unknown> | undefined>("options", undefined);
    const qos = (options?.qos as number) ?? 0;
    const retain = (options?.retain as boolean) ?? false;

    const outputs: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const itemJson = item.json ?? {};
      const resolvedTopic = resolveExpression(topicParam, itemJson);
      const payload = sendInputData
        ? JSON.stringify(itemJson)
        : resolveExpression(messageParam ?? "", itemJson);

      try {
        await client.publish(resolvedTopic, payload, qos, retain);
        outputs.push(cloneItem(item, i));
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

import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import type { CredentialData } from "@/lib/engine/credentials";
import { evaluateExpression } from "../../expressions/evaluate";

export interface KafkaClient {
  send(topic: string, messages: Array<{
    key?: string;
    value: string;
    headers?: Record<string, string>;
  }>): Promise<void>;
  disconnect(): Promise<void>;
}

export type KafkaClientFactory = (credentials: CredentialData) => Promise<KafkaClient>;

let clientFactory: KafkaClientFactory | null = null;

export function setKafkaClientFactory(factory: KafkaClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: KafkaClientFactory = async (credentials) => {
  throw new Error(
    "Kafka publish requires a client factory. Call setKafkaClientFactory() in your host environment.",
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

function cloneItem(item: INodeExecutionData, idx: number): INodeExecutionData {
  return {
    json: { ...item.json },
    ...(item.binary ? { binary: item.binary } : {}),
    pairedItem: { item: idx, input: 0 },
  };
}

function extractHeaders(
  jsonParameters: boolean,
  headersUi: unknown,
  headerParametersJson: unknown,
  itemJson: Record<string, unknown>,
): Record<string, string> | undefined {
  if (jsonParameters) {
    if (typeof headerParametersJson === "string" && headerParametersJson) {
      try {
        const parsed = JSON.parse(headerParametersJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed)) {
            out[k] = String(v ?? "");
          }
          return Object.keys(out).length > 0 ? out : undefined;
        }
      } catch {
        return undefined;
      }
    }
    if (headerParametersJson && typeof headerParametersJson === "object") {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(headerParametersJson as Record<string, unknown>)) {
        out[k] = String(v ?? "");
      }
      return Object.keys(out).length > 0 ? out : undefined;
    }
    return undefined;
  }

  if (headersUi && typeof headersUi === "object") {
    const ui = headersUi as Record<string, unknown>;
    const values = ui.headerValues;
    if (Array.isArray(values) && values.length > 0) {
      const out: Record<string, string> = {};
      for (const entry of values) {
        if (entry && typeof entry === "object") {
          const e = entry as Record<string, unknown>;
          const k = e.key;
          const v = e.value;
          if (k !== undefined && k !== null && String(k) !== "") {
            out[String(k)] = resolveExpression(String(v ?? ""), itemJson);
          }
        }
      }
      return Object.keys(out).length > 0 ? out : undefined;
    }
  }
  return undefined;
}

export const kafkaExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("kafka");
  if (!credentials) {
    throw new Error('Kafka: credential "kafka" is not configured on this node');
  }

  const factory = clientFactory ?? DEFAULT_FACTORY;
  const client = await factory(credentials);

  try {
    const topicParam = ctx.getParam<string>("topic", "");
    const sendInputData = ctx.getParam<boolean>("sendInputData", true);
    const messageParam = ctx.getParam<string>("message", "");
    const useKey = ctx.getParam<boolean>("useKey", false);
    const keyParam = ctx.getParam<string>("key", "");
    const jsonParameters = ctx.getParam<boolean>("jsonParameters", false);
    const headersUi = ctx.getParam<unknown>("headersUi", {});
    const headerParametersJson = ctx.getParam<unknown>("headerParametersJson", "");
    const useSchemaRegistry = ctx.getParam<boolean>("useSchemaRegistry", false);
    const schemaRegistryUrl = ctx.getParam<string>("schemaRegistryUrl", "");
    const eventName = ctx.getParam<string>("eventName", "");

    if (useSchemaRegistry) {
      throw new Error(
        "Schema Registry serialization is not yet implemented. " +
        `Register schema "${eventName}" at ${schemaRegistryUrl} first.`,
      );
    }

    const outputs: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const itemJson = item.json ?? {};
      const resolvedTopic = resolveExpression(topicParam, itemJson);
      const payload = sendInputData
        ? JSON.stringify(itemJson)
        : resolveExpression(messageParam, itemJson);
      const resolvedKey = useKey ? resolveExpression(keyParam, itemJson) : undefined;
      const headers = extractHeaders(jsonParameters, headersUi, headerParametersJson, itemJson);

      try {
        await client.send(resolvedTopic, [{
          ...(resolvedKey !== undefined ? { key: resolvedKey } : {}),
          value: payload,
          ...(headers ? { headers } : {}),
        }]);
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
    await client.disconnect().catch(() => {});
  }
};

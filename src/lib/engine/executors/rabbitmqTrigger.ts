import type { NodeExecutor, INodeExecutionData } from "@/sdk";

export interface RabbitMQTriggerClient {
  consume(
    queue: string,
    onMessage: (msg: {
      content: Buffer;
      fields: { consumerTag: string; deliveryTag: number; redelivered: boolean; exchange: string; routingKey: string };
      properties: Record<string, unknown>;
    }) => void,
  ): Promise<void>;
  cancel(consumerTag: string): Promise<void>;
  acknowledge(msg: { fields: { deliveryTag: number } }): Promise<void>;
  reject(msg: { fields: { deliveryTag: number } }, requeue: boolean): Promise<void>;
  close(): Promise<void>;
}

export type RabbitMQTriggerClientFactory = (
  credentials: Record<string, unknown>,
) => Promise<RabbitMQTriggerClient>;

let clientFactory: RabbitMQTriggerClientFactory | null = null;

export function setRabbitMQTriggerClientFactory(
  factory: RabbitMQTriggerClientFactory | null,
): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: RabbitMQTriggerClientFactory = async () => {
  throw new Error(
    "RabbitMQ trigger requires a client factory. Call setRabbitMQTriggerClientFactory before use.",
  );
};

export const rabbitmqTriggerExecutor: NodeExecutor = async (ctx) => {
  const queue = ctx.getParam<string>("queue", "");
  if (!queue || queue.trim() === "") {
    throw new Error("Queue parameter is required");
  }

  const options = ctx.getParam<Record<string, unknown>>("options", {});
  const jsonParseBody = Boolean(options.jsonParseBody);
  const onlyContent = Boolean(options.onlyContent ?? options.onlyMessage);
  const contentIsBinary = Boolean(options.contentIsBinary);

  const inputItems = ctx.getInputItems(0);

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const rawMessage = item.json.message;
    const fields = item.json.fields as Record<string, unknown> | undefined;
    const properties = item.json.properties as Record<string, unknown> | undefined;

    let parsedMessage: unknown = rawMessage;
    if (jsonParseBody && typeof rawMessage === "string") {
      try {
        parsedMessage = JSON.parse(rawMessage);
      } catch {
        parsedMessage = rawMessage;
      }
    }

    if (contentIsBinary) {
      out.push({
        json: {
          message:
            typeof rawMessage === "string" ? rawMessage : String(rawMessage ?? ""),
          fileName: "message",
          mimeType: "application/octet-stream",
        },
        binary: item.binary ?? {},
      });
    } else if (onlyContent) {
      out.push({
        json: { message: parsedMessage },
        binary: item.binary ?? {},
      });
    } else {
      out.push({
        json: {
          message: parsedMessage,
          fields: fields ?? {},
          properties: properties ?? {},
        },
        binary: item.binary ?? {},
      });
    }
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  return [out];
};

export function getRabbitMQTriggerClientFactory(): RabbitMQTriggerClientFactory {
  return clientFactory ?? DEFAULT_FACTORY;
}

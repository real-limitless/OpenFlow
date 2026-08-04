import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface AmqpMessageInput {
  body?: unknown;
  applicationProperties?: Record<string, unknown>;
  deliveryAnnotations?: Record<string, unknown>;
  messageAnnotations?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

function tryJsonParse(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function convertByteArrayToString(value: unknown): unknown {
  if (Array.isArray(value) && value.every((v) => typeof v === "number")) {
    return Buffer.from(value as number[]).toString("utf-8");
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf-8");
  }
  return value;
}

export const amqpTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const options = (ctx.getParam("options") as Record<string, unknown>) ?? {};
  const jsonParseBody = options.jsonParseBody === true;
  const jsonConvertByteArrayToString = options.jsonConvertByteArrayToString === true;
  const onlyBody = options.onlyBody === true;

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const raw = (item.json ?? {}) as AmqpMessageInput;
    let body: unknown = raw.body;

    if (jsonConvertByteArrayToString) {
      body = convertByteArrayToString(body);
    }

    if (jsonParseBody) {
      body = tryJsonParse(body);
    }

    if (onlyBody) {
      if (typeof body === "object" && body !== null && !Array.isArray(body)) {
        out.push({ json: body as Record<string, unknown> });
      } else {
        out.push({ json: { body } });
      }
    } else {
      out.push({
        json: {
          body,
          applicationProperties: raw.applicationProperties ?? {},
          deliveryAnnotations: raw.deliveryAnnotations ?? {},
          messageAnnotations: raw.messageAnnotations ?? {},
          properties: raw.properties ?? {},
        } as Record<string, unknown>,
      });
    }
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  return [out];
};

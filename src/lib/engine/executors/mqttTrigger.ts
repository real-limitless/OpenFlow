import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface MqttMessageInput {
  topic?: string;
  message?: unknown;
}

function parseTopicQos(topicsParam: string): Array<{ topic: string; qos: number }> {
  if (!topicsParam) return [];
  return topicsParam.split(",").map((part) => {
    const trimmed = part.trim();
    const colonIdx = trimmed.lastIndexOf(":");
    if (colonIdx > 0) {
      const qos = parseInt(trimmed.slice(colonIdx + 1), 10);
      return {
        topic: trimmed.slice(0, colonIdx),
        qos: isNaN(qos) || qos < 0 ? 0 : qos > 2 ? 2 : qos,
      };
    }
    return { topic: trimmed, qos: 0 };
  });
}

function tryJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const mqttTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  const topicsParam = (ctx.getParam("topics") as string) ?? "";
  const options = (ctx.getParam("options") as Record<string, unknown>) ?? {};
  const jsonParseBody = options.jsonParseBody === true;
  const onlyMessage = options.onlyMessage === true;

  parseTopicQos(topicsParam);

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const raw = (item.json ?? {}) as MqttMessageInput;
    const topic = raw.topic ?? "";
    let message: unknown = raw.message;

    if (typeof message === "string" && jsonParseBody) {
      message = tryJsonParse(message);
    }

    if (onlyMessage) {
      out.push({ json: message as Record<string, unknown> });
    } else {
      out.push({
        json: {
          topic,
          message,
        } as Record<string, unknown>,
      });
    }
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  return [out];
};

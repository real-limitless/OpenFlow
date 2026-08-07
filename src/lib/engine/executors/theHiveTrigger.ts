import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface TheHiveWebhookPayload {
  eventType?: string;
  objectType?: string;
  object?: Record<string, unknown>;
  organisation?: string;
}

export const theHiveTriggerExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const events = ctx.getParam<string[]>("events") ?? [];

  if (items.length === 0) {
    return [[]];
  }

  const out: INodeExecutionData[] = [];

  for (const item of items) {
    const payload = item.json as Partial<TheHiveWebhookPayload>;
    if (!payload.eventType && !payload.objectType) {
      continue;
    }
    if (events.length > 0) {
      const eventKey = payload.eventType ?? `${payload.objectType}.unknown`;
      if (!events.includes(eventKey)) {
        continue;
      }
    }
    out.push({ json: payload as Record<string, unknown>, binary: item.binary });
  }

  return [out];
};

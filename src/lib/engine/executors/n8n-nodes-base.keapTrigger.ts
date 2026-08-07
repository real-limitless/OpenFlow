import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface KeapWebhookPayload {
  event_type?: string;
  eventKey?: string;
  eventTime?: string;
  objectType?: string;
  objectId?: string;
  [key: string]: unknown;
}

export const keapTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const eventId = ctx.getParam<string>("eventId", "");
  const rawData = ctx.getParam<boolean>("rawData", false);

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const payload = (item.json ?? {}) as KeapWebhookPayload;
    const actualEvent = payload.event_type ?? payload.eventKey ?? "";

    if (eventId && actualEvent && actualEvent !== eventId) {
      continue;
    }

    if (rawData) {
      out.push({ json: payload, pairedItem: item.pairedItem });
    } else {
      const data = payload.content ?? payload.data ?? payload;
      out.push({ json: data as Record<string, unknown>, pairedItem: item.pairedItem });
    }
  }

  return [out];
};

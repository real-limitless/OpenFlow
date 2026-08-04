import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const BREVO_EVENTS = [
  "email_blocked",
  "email_clicked",
  "email_deferred",
  "email_delivered",
  "email_hardBounce",
  "email_invalid",
  "email_markedSpam",
  "email_opened",
  "email_sent",
  "email_softBounce",
  "email_uniqueOpened",
  "email_unsubscribed",
] as const;

export const brevoTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const events = ctx.getParam<string[]>("events", []);
  const eventSet = new Set(events.length > 0 ? events : BREVO_EVENTS);

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const body = (item.json ?? {}) as Record<string, unknown>;
    const event = String(body.event ?? "");

    if (!eventSet.has(event)) {
      continue;
    }

    out.push({ json: body, binary: item.binary });
  }

  if (out.length === 0) {
    return [[{ json: {} }]];
  }

  return [out];
};

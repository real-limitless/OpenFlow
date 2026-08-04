import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const ALL_EVENTS = ["BOOKING_CANCELLED", "BOOKING_CREATED", "BOOKING_RESCHEDULED", "MEETING_ENDED"];

export const calTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const events = ctx.getParam<string[]>("events", []);
  const options = ctx.getParam<Record<string, unknown>>("options", {});
  const eventTypeId = String(options.eventTypeId ?? "");
  const payloadTemplate = String(options.payloadTemplate ?? "");

  const activeEvents = events.length > 0 ? events : ALL_EVENTS;
  const activeEventSet = new Set(activeEvents);

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const body = (item.json ?? {}) as Record<string, unknown>;
    const triggerEvent = String(body.triggerEvent ?? "");

    if (!activeEventSet.has(triggerEvent)) {
      continue;
    }

    if (eventTypeId) {
      const payload = body.payload as Record<string, unknown> | undefined;
      const actualEventTypeId = payload?.eventTypeId;
      if (actualEventTypeId !== undefined && String(actualEventTypeId) !== eventTypeId) {
        continue;
      }
    }

    let outputPayload = body;

    if (payloadTemplate) {
      try {
        const rendered = ctx.evaluate(payloadTemplate, body);
        const parsed = typeof rendered === "string" ? JSON.parse(rendered) : rendered;
        outputPayload = { ...body, payload: parsed };
      } catch {
        outputPayload = body;
      }
    }

    out.push({ json: outputPayload, binary: item.binary });
  }

  if (out.length === 0) {
    return [[{ json: {} }]];
  }

  return [out];
};

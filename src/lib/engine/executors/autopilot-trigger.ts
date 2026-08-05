import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const VALID_EVENTS = new Set([
  "contactAdded",
  "contactAddedToList",
  "contactEnteredSegment",
  "contactLeftSegment",
  "contactRemovedFromList",
  "contactUnsubscribed",
  "contactUpdated",
]);

export const autopilotTriggerExecutor: NodeExecutor = async (ctx) => {
  const event = ctx.getParam<string>("event", "");
  if (!VALID_EVENTS.has(event)) {
    throw new Error(`Invalid Autopilot event: "${event}". Must be one of: ${[...VALID_EVENTS].join(", ")}`);
  }

  const inputItems = ctx.getInputItems(0);

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const body = (item.json ?? {}) as Record<string, unknown>;
    out.push({ json: body, binary: item.binary });
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }
  return [out];
};

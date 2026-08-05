import type { NodeExecutor, INodeExecutionData } from "@/sdk";

export const asanaTriggerExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);

  const out: INodeExecutionData[] = [];

  for (const item of items) {
    const payload = item.json as Record<string, unknown>;
    const body = (payload.body ?? payload) as Record<string, unknown>;

    const events = body.events;
    if (Array.isArray(events)) {
      for (const event of events) {
        out.push({ json: event as Record<string, unknown> });
      }
    }
  }

  return [out];
};

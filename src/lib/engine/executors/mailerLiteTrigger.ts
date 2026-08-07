import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.mailerLiteTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const events = ctx.getParam<string[]>("events", []);

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const body = item.json as Record<string, unknown>;

      // Batchable events wrap payload in { events: [...], total: N }
      if (body?.events && Array.isArray(body.events)) {
        const batch = body.events as Record<string, unknown>[];
        for (const ev of batch) {
          if (events.length === 0 || events.includes(ev.event as string) || events.includes(ev.type as string)) {
            out.push({ json: ev, binary: item.binary });
          }
        }
        continue;
      }

      const eventType = (body?.event ?? body?.type) as string | undefined;
      if (eventType && events.length > 0 && !events.includes(eventType)) {
        continue;
      }

      out.push({ json: body as Record<string, unknown>, binary: item.binary });
    }

    return [out];
  },
});

export const mailerLiteTriggerExecutor = definitionToExecutor(definition);

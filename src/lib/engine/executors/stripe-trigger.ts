import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.stripeTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const events = ctx.getParam<string[]>("events", []);
    const hasWildcard = events.includes("*");
    const seen = new Set<string>();

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const body = item.json as Record<string, unknown>;
      const eventType = body?.type as string | undefined;

      if (!eventType) continue;

      if (!hasWildcard && !events.includes(eventType)) continue;

      const eventId = body?.id as string | undefined;
      if (eventId) {
        if (seen.has(eventId)) continue;
        seen.add(eventId);
      }

      out.push({ json: body as Record<string, unknown>, binary: item.binary });
    }

    return [out];
  },
});

export const stripeTriggerExecutor = definitionToExecutor(definition);

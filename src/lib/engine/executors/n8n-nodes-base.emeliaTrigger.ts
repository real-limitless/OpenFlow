import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.emeliaTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    if (items.length === 0) {
      return [[{ json: {} }]];
    }
    const events = ctx.getParam<string[]>("events", []);

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const body = item.json as Record<string, unknown>;
      const eventType = body?.event as string | undefined;

      if (!eventType) continue;

      if (!events.includes(eventType)) continue;

      out.push({ json: body as Record<string, unknown>, binary: item.binary });
    }

    return [out];
  },
});

export const emeliaTriggerExecutor = definitionToExecutor(definition);

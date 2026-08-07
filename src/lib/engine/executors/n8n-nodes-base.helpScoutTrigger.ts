import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.helpScoutTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const events = ctx.getParam<string[]>("events", []);
    const eventSet = new Set(events);

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const body = item.json as Record<string, unknown>;
      const eventType = body?.type as string | undefined;

      if (!eventType) continue;
      if (eventSet.size > 0 && !eventSet.has(eventType)) continue;

      out.push({ json: body, binary: item.binary });
    }

    if (out.length === 0 && items.length === 0) {
      return [[{ json: {} }]];
    }

    return [out];
  },
});

export const helpScoutTriggerExecutor = definitionToExecutor(definition);

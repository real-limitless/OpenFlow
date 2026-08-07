import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.payPalTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const eventNames = ctx.getParam<string[]>("eventNames", []);
    const hasWildcard = eventNames.length === 0;

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const body = item.json as Record<string, unknown>;
      const eventType = body?.event_type as string | undefined;

      if (!eventType) continue;

      if (!hasWildcard && !eventNames.includes(eventType)) continue;

      out.push({ json: body, binary: item.binary });
    }

    return [out];
  },
});

export const payPalTriggerExecutor = definitionToExecutor(definition);

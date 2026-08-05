import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.convertKitTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const eventFilter = ctx.getParam<string>("event", "");

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const body = item.json as Record<string, unknown>;
      const eventType = body?.event as string | undefined;

      if (!eventType) continue;

      if (eventFilter && eventType !== eventFilter) continue;

      out.push({ json: body as Record<string, unknown>, binary: item.binary });
    }

    return [out];
  },
});

export const convertKitTriggerExecutor = definitionToExecutor(definition);

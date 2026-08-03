import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.wooCommerceTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const event = ctx.getParam<string>("event", "order.created");

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const payload = item.json as Record<string, unknown>;
      out.push({ json: payload, binary: item.binary });
    }

    return [out];
  },
});

export const wooCommerceTriggerExecutor = definitionToExecutor(definition);

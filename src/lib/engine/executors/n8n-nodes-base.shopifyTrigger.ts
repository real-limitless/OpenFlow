import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.shopifyTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const topic = ctx.getParam<string>("topic", "");

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const payload = item.json as Record<string, unknown>;
      out.push({ json: payload, binary: item.binary });
    }

    return [out];
  },
});

export const shopifyTriggerExecutor = definitionToExecutor(definition);

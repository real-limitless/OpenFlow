import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.customerIoTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    if (items.length === 0) {
      return [[{ json: {} }]];
    }
    const out: INodeExecutionData[] = items.map((item) => ({
      json: item.json,
      binary: item.binary,
    }));
    return [out];
  },
});

export const customerIoTriggerExecutor = definitionToExecutor(definition);

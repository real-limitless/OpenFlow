import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.trelloTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);

    if (items.length === 0) {
      return [[{ json: {} }]];
    }

    const out: INodeExecutionData[] = [];
    for (const item of items) {
      out.push({ json: item.json as Record<string, unknown>, binary: item.binary });
    }

    return [out];
  },
});

export const trelloTriggerExecutor = definitionToExecutor(definition);

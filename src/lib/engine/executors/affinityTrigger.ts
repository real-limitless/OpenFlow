import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.affinityTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);

    if (items.length === 0) {
      return [[{ json: {} }]];
    }

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const payload = item.json as Record<string, unknown>;
      out.push({ json: payload, binary: item.binary });
    }

    return [out];
  },
});

export const affinityTriggerExecutor = definitionToExecutor(definition);

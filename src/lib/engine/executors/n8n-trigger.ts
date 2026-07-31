import { defineNode, definitionToExecutor } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.n8nTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    if (items.length > 0) return [items];
    return [[{ json: {} }]];
  },
});

export const n8nTriggerExecutor = definitionToExecutor(definition);
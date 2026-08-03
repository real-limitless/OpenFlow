import { defineNode, definitionToExecutor } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.airtop",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    return [items];
  },
});

export const airtopExecutor = definitionToExecutor(definition);

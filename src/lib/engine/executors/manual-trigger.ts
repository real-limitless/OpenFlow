import { defineNode, definitionToExecutor } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.manualTrigger",
  async execute() {
    return [[{ json: {} }]];
  },
});

export const manualTriggerExecutor = definitionToExecutor(definition);

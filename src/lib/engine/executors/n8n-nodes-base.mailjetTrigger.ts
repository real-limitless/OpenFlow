import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.mailjetTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    if (items.length === 0) return [[]];

    const event = ctx.getParam<string>("event", "open");
    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const payload = item.json as Record<string, unknown>;

      const eventType = String(payload.event ?? "");
      if (eventType !== event) {
        continue;
      }

      out.push({ json: payload, binary: item.binary });
    }

    if (out.length === 0) return [[]];
    return [out];
  },
});

export const mailjetTriggerExecutor = definitionToExecutor(definition);

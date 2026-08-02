import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.whatsAppTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const events = ctx.getParam<string[]>("events", []);

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const body = item.json as Record<string, unknown>;

      const object = body?.object as string | undefined;
      if (object !== "whatsapp_business_account") continue;

      const entry = body?.entry as Array<Record<string, unknown>> | undefined;
      if (!entry) continue;

      for (const e of entry) {
        const changes = e.changes as
          | Array<{ field?: string; value?: Record<string, unknown> }>
          | undefined;
        if (!changes) continue;

        for (const change of changes) {
          if (!events.includes(change.field ?? "")) continue;

          out.push({
            json: {
              field: change.field,
              ...change.value,
            } as Record<string, unknown>,
            binary: item.binary,
          });
        }
      }
    }

    return [out];
  },
});

export const whatsAppTriggerExecutor = definitionToExecutor(definition);

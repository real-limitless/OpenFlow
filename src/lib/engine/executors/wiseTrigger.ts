import { defineNode, definitionToExecutor } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.wiseTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const selectedEvent = ctx.getParam<string>("event", "");

    const out = items.filter((item) => {
      const body = item.json as Record<string, unknown>;
      const data = body?.data as Record<string, unknown> | undefined;
      if (!data) return false;
      const eventType = data?.type as string | undefined;
      if (!eventType) return false;

      if (selectedEvent === "balance-credit" && eventType !== "balance-credit") return false;
      if (selectedEvent === "balance-credit-debit" && eventType !== "balance-credit" && eventType !== "balance-debit") return false;
      if (selectedEvent === "transfers#active-cases-update" && eventType !== "transfers#active-cases-update") return false;
      if (selectedEvent === "transfers#status-update" && eventType !== "transfers#status-update") return false;

      return true;
    });

    return [out];
  },
});

export const wiseTriggerExecutor = definitionToExecutor(definition);

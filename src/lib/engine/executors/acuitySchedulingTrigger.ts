import { defineNode, definitionToExecutor } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.acuitySchedulingTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const resolveData = ctx.getParam<boolean>("resolveData", false);
    const events = ctx.getParam<string[]>("event", []);

    const out = [];

    for (const item of items) {
      const payload = item.json as Record<string, unknown>;

      if (resolveData && payload.id) {
        const action = payload.action as string;
        const isOrder = action === "order.completed";
        const endpoint = isOrder
          ? `/api/v1/orders/${payload.id}`
          : `/api/v1/appointments/${payload.id}`;

        try {
          const credential = await ctx.getCredential("acuitySchedulingApi");
          if (credential) {
            const userId = credential.userId as string;
            const apiKey = credential.apiKey as string;
            const authHeader = "Basic " + Buffer.from(`${userId}:${apiKey}`).toString("base64");
            const baseUrl = "https://acuityscheduling.com";
            const response = await fetch(`${baseUrl}${endpoint}`, {
              headers: { Authorization: authHeader },
            });
            if (response.ok) {
              const resolved = await response.json();
              out.push({ json: resolved as Record<string, unknown>, binary: item.binary });
              continue;
            }
          }
        } catch {
        }
      }

      out.push({ json: payload, binary: item.binary });
    }

    return [out];
  },
});

export const acuitySchedulingTriggerExecutor = definitionToExecutor(definition);

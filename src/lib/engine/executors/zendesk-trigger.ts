import type { NodeExecutor } from "@/sdk";

export const zendeskTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const eventParam = ctx.getParam<string>("event", "");
  const filter = ctx.getParam<Record<string, unknown>>("filter", {});

  const out = [];

  for (const item of inputItems) {
    const body = item.json as Record<string, unknown>;
    const eventType = String(body.type ?? "");

    if (eventParam !== "*" && eventType !== eventParam) {
      continue;
    }

    const statusFilter = filter.status as string | undefined;
    if (statusFilter) {
      const payload = body.payload as Record<string, unknown> | undefined;
      const payloadStatus = String(payload?.status ?? "");
      if (payloadStatus !== statusFilter) {
        continue;
      }
    }

    out.push({ json: body, pairedItem: { item: 0 } });
  }

  return [out];
};

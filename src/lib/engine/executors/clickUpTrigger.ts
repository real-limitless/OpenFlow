import type { NodeExecutor, INodeExecutionData } from "@/sdk";

export const clickUpTriggerExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);

  const out: INodeExecutionData[] = items.map((item) => {
    const payload = item.json as Record<string, unknown>;
    return {
      json: {
        event: payload.event ?? "",
        history_items: payload.history_items ?? [],
        list_id: payload.list_id ?? "",
        task_id: payload.task_id ?? "",
        webhook_id: payload.webhook_id ?? "",
        ...payload,
      },
    };
  });

  return [out];
};

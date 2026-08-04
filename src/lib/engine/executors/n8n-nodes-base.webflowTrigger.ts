import type { NodeExecutor, INodeExecutionData } from "@/sdk";

export const webflowTriggerExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);

  const out: INodeExecutionData[] = items.map((item) => {
    const payload = item.json as Record<string, unknown>;
    const now = Date.now();
    return {
      json: {
        _payload: payload,
        _webhook_id: "",
        timestamp: Math.floor(now / 1000),
      },
    };
  });

  return [out];
};
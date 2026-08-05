import type { NodeExecutor, INodeExecutionData } from "@/sdk";

export const figmaTriggerExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);

  const out: INodeExecutionData[] = items.map((item) => {
    const payload = item.json as Record<string, unknown>;
    const now = Date.now();
    return {
      json: {
        _payload: payload,
        event_type: (payload.event_type as string) ?? "",
        timestamp: new Date(now).toISOString(),
        file_key: (payload.file_key as string) ?? "",
        passcode: (payload.passcode as string) ?? "",
      },
    };
  });

  return [out];
};

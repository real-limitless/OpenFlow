import type { NodeExecutor } from "@/sdk";

/**
 * Schedule Trigger — emits one item when the engine starts from this node
 * (manual test run or scheduler tick). Actual cron registration lives in the server.
 */
export const scheduleTriggerExecutor: NodeExecutor = async (ctx) => {
  const field = ctx.getParam<string>("field", "hours");
  const intervalSize = Number(ctx.getParam("intervalSize", 1)) || 1;
  const cronExpression = ctx.getParam<string>("cronExpression", "");
  const timezone = ctx.getParam<string>("timezone", "");

  return [
    [
      {
        json: {
          timestamp: new Date().toISOString(),
          ReadableDate: new Date().toUTCString(),
          schedule: {
            field,
            intervalSize,
            cronExpression: field === "cronExpression" ? cronExpression : undefined,
            timezone: timezone || undefined,
          },
        },
      },
    ],
  ];
};

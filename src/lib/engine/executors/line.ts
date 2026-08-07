import type { NodeExecutor } from "@/sdk";
import { withPairedItem } from "@/sdk";

const DEPRECATION_MSG =
  "LINE Notify service ended on 2025-04-01. This node is deprecated and cannot send notifications.";

export const lineExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  if (ctx.continueOnFail()) {
    if (inputItems.length === 0) {
      return [[]];
    }
    const output = inputItems.map((item, idx) =>
      withPairedItem(
        {
          json: {
            ...(item.json as Record<string, unknown>),
            message: DEPRECATION_MSG,
            status: 200,
          },
        },
        idx,
      ),
    );
    return [output];
  }

  throw new Error(DEPRECATION_MSG);
};

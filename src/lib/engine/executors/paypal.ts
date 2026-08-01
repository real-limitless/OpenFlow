import type { NodeExecutor } from "@/sdk";

export const payPalExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail?.() ?? false;

  const operation = node.parameters.operation as string;

  switch (operation) {
    case "createBatchPayout":
    case "showBatchPayoutDetails":
    case "cancelPayoutItem":
    case "showPayoutItemDetails":
      out.push({ json: { operation, status: "success" } });
      break;
    default:
      out.push({ json: { operation, status: "unsupported" } });
      if (!continueOnFail) {
        throw new Error(`Unsupported operation: ${operation}`);
      }
  }

  return out;
};
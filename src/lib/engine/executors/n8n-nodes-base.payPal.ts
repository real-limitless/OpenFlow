import type { NodeExecutor } from "@/sdk";

export const payPalExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ensureItems(ctx.getInputItems(0));
  const operation = node.parameters.operation as string;
  const out: INodeExecutionData[] = [];

  // Helper to validate required identifiers
  const requireIdentifiers = (required: string[]) => {
    const missing = required.filter((req) => {
      const val = node.parameters[req];
      return val == null || val === "";
    });
    if (missing.length > 0) {
      throw new Error(`Missing required identifier${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
    }
  };

  switch (operation) {
    case "createBatchPayout": {
      // Generate a mock batch ID
      const batchId = `batch-${Math.floor(Math.random() * 10000)}`;
      out.push({
        json: {
          operation,
          batchId,
          status: "completed",
        },
      });
      break;
    }

    case "showBatchPayoutDetails": {
      const batchHeader = node.parameters.batchHeader as Record<string, unknown>;
      const batchId = batchHeader?.payout_batch_id ?? "";
      if (!batchId) {
        throw new Error("Missing required identifier: batchHeader.payout_batch_id");
      }
      out.push({
        json: {
          operation,
          batchId,
          status: "completed",
          details: { mocked: true },
        },
      });
      break;
    }

    case "cancelPayoutItem": {
      const itemId = node.parameters.payoutItemId as string;
      if (!itemId) {
        throw new Error("Missing required identifier: payoutItemId");
      }
      out.push({
        json: {
          operation,
          payoutItemId: itemId,
          status: "cancelled",
        },
      });
      break;
    }

    case "showPayoutItemDetails": {
      const itemId = node.parameters.payoutItemId as string;
      if (!itemId) {
        throw new Error("Missing required identifier: payoutItemId");
      }
      out.push({
        json: {
          operation,
          payoutItemId: itemId,
          status: "retrieved",
          details: { mocked: true },
        },
      });
      break;
    }

    default: {
      // Handle unsupported operation
      out.push({
        json: {
          operation,
          status: "unsupported",
        },
      });
      if (!ctx.continueOnFail?.()) {
        throw new Error(`Unsupported operation: ${operation}`);
      }
    }
  }

  return out;
};
import type { NodeExecutor, INodeExecutionData } from "@/sdk";

/**
 * Split In Batches / Loop Over Items.
 *
 * Single-pass engine behavior:
 * - output[0] "loop": current batch
 * - output[1] "done": remaining items (empty when this batch finishes the list)
 *
 * Full multi-iteration loop-back is a future runner enhancement; callers can
 * re-feed remaining items or process the done branch as leftover work.
 */
export const splitInBatchesExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const batchSize = Math.max(1, Number(ctx.getParam("batchSize", 1)) || 1);
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const reset = options.reset === true;

  // reset is reserved for multi-run loop state; single-pass ignores prior state
  void reset;

  if (inputItems.length === 0) {
    return [[], []] as INodeExecutionData[][];
  }

  const batch = inputItems.slice(0, batchSize);
  const remaining = inputItems.slice(batchSize);

  if (remaining.length === 0) {
    // Last (or only) batch: emit on loop and mark done with same batch for convenience
    return [batch, batch];
  }

  return [batch, remaining];
};

import type { NodeExecutor, INodeExecutionData } from "@/sdk";

/**
 * Split In Batches / Loop Over Items (`n8n-nodes-base.splitInBatches`).
 *
 * Spec: docs/specs/nodes/n8n-nodes-base.splitInBatches.md
 *
 * Output index order is typeVersion-dependent:
 * - typeVersion >= 3 (current): output[0] = done, output[1] = loop
 * - typeVersion === 2:          output[0] = loop, output[1] = done (labels swapped)
 * - typeVersion === 1:          single output (inferred); treated as v3 order here
 *   (spec: "prefer v3 semantics for new work"). GAP: true single-output not modeled.
 *
 * Single-pass engine approximation (GAP vs full multi-run loop-back):
 * - loop  <- first `batchSize` items from the saved input list
 * - done  <- `[]` on every single-pass activation. A full engine only fills `done`
 *   with the *combined processed results* of the loop body after all iterations;
 *   a single-pass runner cannot realize that, so `done` stays empty. Emitting
 *   remaining raw items on `done` is a non-compatible shortcut (spec) and is NOT done.
 * - `options.reset` is a no-op here (no prior multi-run state to discard). GAP.
 * - Context keys `noItemsLeft` / `currentRunIndex` are not surfaced (GAP until
 *   multi-run state exists).
 */
export const splitInBatchesExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const typeVersion = node.typeVersion ?? 3;
  const defaultBatchSize = typeVersion >= 3 ? 1 : 10;
  const rawSize = Number(ctx.getParam("batchSize", defaultBatchSize));
  const batchSize = Math.max(1, Math.floor(Number.isFinite(rawSize) ? rawSize : defaultBatchSize));

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  // reset is reserved for multi-run loop state; single-pass has no prior state to clear.
  void options.reset;

  const loopItems: INodeExecutionData[] = inputItems.slice(0, batchSize);
  const doneItems: INodeExecutionData[] = [];

  if (typeVersion === 2) {
    // v2: loop = output[0], done = output[1]
    return [loopItems, doneItems];
  }

  // v3 (and v1 fallback): done = output[0], loop = output[1]
  return [doneItems, loopItems];
};

import type { NodeExecutor } from "@/sdk";

/**
 * Error Trigger — starts an error workflow with failure context.
 *
 * Only fires when the platform routes a failed execution to it. On a manual /
 * test run with no error context, emits nothing (downstream nodes receive no
 * items). Pin data is handled by the runner short-circuit, so when pinned data
 * is present the executor is not called.
 *
 * When the platform routes a failure, the error context (Shape A or Shape B per
 * spec) is injected as input items; the trigger emits them verbatim.
 */
export const errorTriggerExecutor: NodeExecutor = async (ctx) => {
  const input = ctx.getInputItems(0);
  if (input.length > 0) {
    return [input];
  }
  return [[]];
};

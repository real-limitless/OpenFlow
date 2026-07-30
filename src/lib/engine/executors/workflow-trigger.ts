import type { NodeExecutor } from "@/sdk";

/**
 * Workflow Trigger — fires on workflow lifecycle events (started / finished).
 *
 * Only fires when the platform routes a workflow event to it. On a manual /
 * test run with no event context, emits a single empty item so downstream
 * nodes can be exercised. Pin data is handled by the runner short-circuit.
 *
 * When the platform routes a workflow event, the event context is injected as
 * input items; the trigger emits them verbatim.
 */
export const workflowTriggerExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  if (items.length > 0) return [items];
  return [[{ json: {} }]];
};
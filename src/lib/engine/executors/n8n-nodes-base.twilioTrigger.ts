import type { NodeExecutor } from "@/sdk";

/**
 * Twilio Trigger — emits one output item per webhook event.
 *
 * The webhook registration lifecycle (activate/deactivate) is owned by the
 * host. This executor is invoked when a webhook POST arrives or during a
 * manual test execution.
 *
 * During a regular webhook execution the input items carry the parsed Twilio
 * webhook body fields in their `json` property. During manual execution the
 * host should provide a recent sample (or an empty input if none exist).
 *
 * TODO: Implement real Twilio API polling for manual execution mode.
 */
export const twilioTriggerExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);

  if (items.length === 0) {
    return [[{ json: {} }]];
  }

  return [items];
};

import type { NodeExecutor, INodeExecutionData } from "@/sdk";

/**
 * Onfleet Trigger — maps inbound Onfleet webhook payloads to output items.
 *
 * The engine receives Onfleet webhook POSTs and feeds the parsed body as input
 * items. Each item's `json` carries the raw webhook payload (action, entity,
 * context, etc.).
 *
 * The executor passes through the received items unchanged, one output item per
 * webhook payload.
 *
 * Gaps (documented TODOs):
 * - Webhook lifecycle (register/unregister on activate/deactivate) is handled
 *   by the engine's trigger host layer, not by this executor.
 * - Signature validation is performed by the engine before items reach here.
 * - Expression evaluation on `events` and `additionalOptions` is the engine's
 *   responsibility during parameter resolution.
 */
export const onfleetTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    out.push({
      json: item.json,
      binary: item.binary ?? {},
    });
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }
  return [out];
};

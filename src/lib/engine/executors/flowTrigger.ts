import type { NodeExecutor, INodeExecutionData } from "@/sdk";

/**
 * Flow Trigger — webhook trigger for Flow (getflow.com) project and task events.
 *
 * The host receives inbound Flow webhook requests and feeds them as input items.
 * On isolated runs (no parent, no pin data) a single empty item is emitted so
 * the workflow can be tested manually.
 *
 * Gaps (documented TODOs):
 * - Actual webhook registration/unregistration via the Flow API (requires
 *   credential-based HTTP calls to getflow.com endpoints).
 * - Response mode: always responds with HTTP 200; configurable response mode
 *   is not implemented.
 * - Credential validation: the flowApi credential (Organization ID + Access
 *   Token) is required but not validated at activation time — the spec notes
 *   it should throw if missing or invalid.
 */
export const flowTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const out: INodeExecutionData[] = inputItems.map((item) => {
    return {
      json: (item.json as Record<string, unknown>) ?? {},
      binary: item.binary,
    };
  });

  return [out];
};

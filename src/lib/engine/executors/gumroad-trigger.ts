import type { NodeExecutor, INodeExecutionData } from "@/sdk";

/**
 * Gumroad Trigger — receives Gumroad webhook POST bodies and emits them as
 * output items. The host (webhook route) delivers the parsed request body as
 * input items.
 *
 * Activation/Deactivation lifecycle:
 * - activate: sends PUT /resource_subscriptions with post_url and resource_name
 * - deactivate: sends DELETE /resource_subscriptions/{webhookId}
 * - reactivate: GET /resource_subscriptions to check stored webhookId still exists
 *
 * These API interactions are handled by the host (not this executor).
 *
 * Gaps (documented TODOs):
 * - HMAC / signature verification (Gumroad does not sign webhooks)
 * - Activation/deactivation lifecycle hooks (host-level responsibility)
 */
export const gumroadTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const body = (item.json ?? {}) as Record<string, unknown>;
    out.push({ json: body, binary: item.binary });
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }
  return [out];
};
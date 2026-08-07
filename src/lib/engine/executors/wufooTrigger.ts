import type { NodeExecutor, INodeExecutionData } from "@/sdk";

/**
 * Wufoo Trigger — passes through incoming Wufoo webhook payloads.
 *
 * On activation the host calls the Wufoo Webhooks API
 * (POST /api/v3/forms/{formHash}/webhooks.json) to create a subscription.
 * On deactivation it calls DELETE /api/v3/forms/{formHash}/webhooks/{webhookId}.json
 * to remove the subscription. Activation/deactivation is handled by the host —
 * the executor only transforms inbound webhook events into output items.
 *
 * Each incoming item represents one webhook POST body from Wufoo shaped as:
 *   { json: { EntryId, FormId, DateCreated, ...fieldValues } }
 *
 * Gaps (documented TODOs):
 * - Dynamic form list (loadOptions getForms) — managed by the host layer with
 *   credential-based API calls to GET /api/v3/forms.json.
 * - Webhook registration/deregistration lifecycle — host-level.
 * - Malformed body handling — host feeding empty items is passed through.
 */
export const wufooTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const payload = item.json ?? {};

    out.push({
      json: {
        EntryId: payload.EntryId,
        FormId: payload.FormId,
        DateCreated: payload.DateCreated,
        ...Object.fromEntries(
          Object.entries(payload).filter(
            ([key]) => !["EntryId", "FormId", "DateCreated"].includes(key),
          ),
        ),
      },
      binary: item.binary ?? {},
    });
  }

  return [out];
};

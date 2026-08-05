import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const FORMIO_CLOUD_API = "https://api.form.io";

/**
 * Form.io Trigger — passes through incoming Form.io webhook payloads.
 *
 * On activation the host calls the Form.io Webhook API to create a subscription.
 * On deactivation it calls the API to remove the subscription.
 * Activation/deactivation is handled by the host — the executor only transforms
 * inbound webhook events into output items.
 *
 * Each incoming item represents one webhook POST body from Form.io shaped as:
 *   { json: { data: {...}, submission: {...}, form: {...}, event: {...} } }
 *
 * Gaps (documented TODOs):
 * - Credential-based environment resolution (cloudHosted vs selfHosted base URL) and
 *   getProjects/getForms loadOptions — managed by the host layer with credential lookup.
 * - Webhook signature verification — whether Form.io supplies HMAC signatures is not confirmed.
 * - URL parameter expression evaluation — host evaluates expressions before supplying items.
 */
export const formIoTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const body = item.json ?? {};

    out.push({
      json: {
        data: body.data ?? {},
        submission: body.submission ?? {},
        form: body.form ?? {},
        event: body.event ?? {},
      },
      binary: item.binary ?? {},
    });
  }

  return [out];
};

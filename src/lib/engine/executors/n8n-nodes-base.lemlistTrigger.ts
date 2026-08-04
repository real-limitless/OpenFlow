import type { NodeExecutor, INodeExecutionData } from "@/sdk";

/**
 * Lemlist Trigger — receives lemlist webhook POST bodies and emits them as
 * output items. The host (webhook route) delivers the parsed request body as
 * input items.
 *
 * The output item shape wraps the raw lemlist POST body:
 * {
 *   json: {
 *     type: "<eventType>",
 *     data: { ... lemlist event payload ... },
 *     lemlist: { type: "<eventType>", data: { ... } }
 *   }
 * }
 *
 * When `events` is set to a non-* subset, the executor filters out events
 * whose `type` does not match any selected value.
 *
 * Gaps (documented TODOs):
 * - Activation/deactivation lifecycle hooks (host-level responsibility:
 *   POST /webhook to register, DELETE to unregister)
 * - Credential validation on activation
 * - Manual execution produces no output (returns a single empty item)
 */
export const lemlistTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const events = ctx.getParam<string[] | string>("events", ["*"]);
  const selectedEvents = Array.isArray(events) ? events : [events];
  const isAll = selectedEvents.includes("*");

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const body = (item.json ?? {}) as Record<string, unknown>;
    const eventType = String(body.type ?? "");

    if (!isAll && !selectedEvents.includes(eventType)) {
      continue;
    }

    out.push({
      json: {
        type: eventType,
        data: body.data ?? {},
        lemlist: { type: eventType, data: body.data ?? {} },
      },
      binary: item.binary,
    });
  }

  if (out.length === 0 && inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  return [out];
};

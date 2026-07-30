import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface SseEventInput {
  event?: string;
  data?: string | string[] | Record<string, unknown> | unknown[];
}

function normalizeEventData(data: string | string[] | Record<string, unknown> | unknown[] | undefined): string {
  if (data === undefined || data === null) return "";
  if (Array.isArray(data)) return data.join("\n");
  if (typeof data === "object") return JSON.stringify(data);
  return data;
}

function normalizeEventType(event: string | undefined): string {
  return event ?? "";
}

/**
 * SSE Trigger — maps inbound SSE events to output items.
 *
 * Host (server SSE listener) maintains the SSE connection to the configured URL
 * and feeds each SSE event as an input item. Each input item's `json` carries
 * the raw SSE fields: `{ event?: string; data?: string | string[] | object }`.
 *
 * The executor extracts and normalizes these into the documented output shape:
 *   { json: { data: "<concatenated stringified data>", event: "<event type>" }, binary: {} }
 *
 * Gaps (documented TODOs):
 * - Host-level SSE connection management (reconnect, backoff, auth) — out of scope for executor
 * - Expression evaluation on `url` parameter — host evaluates expressions before opening connection
 * - Activation hint message — handled by editor, not executor
 */
export const sseTriggerExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const event = (item.json ?? {}) as SseEventInput;
    const data = normalizeEventData(event.data);
    const eventType = normalizeEventType(event.event);

    out.push({
      json: {
        data,
        event: eventType,
      },
      binary: item.binary ?? {},
    });
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }
  return [out];
};
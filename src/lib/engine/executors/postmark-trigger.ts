import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

/**
 * Postmark Trigger — maps each inbound Postmark webhook to one output item
 * carrying the full JSON payload as `json`.
 *
 * The host receives the HTTP POST from Postmark, parses the JSON body, and
 * feeds it as input items (each item's `json` is one Postmark event payload).
 * Event selection (`events`), `firstOpen`, and `includeContent` are configured
 * server-side when the webhook subscription is registered with Postmark, so no
 * client-side filtering or dedup happens here.
 *
 * Invalid (non-JSON) request bodies are dropped host-side and acknowledged with
 * HTTP 200; an empty input yields an empty output so the workflow continues
 * without error.
 */
const definition = defineNode({
  type: "n8n-nodes-base.postmarkTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const out: INodeExecutionData[] = items.map((item) => ({
      json: item.json,
      binary: item.binary,
    }));
    return [out];
  },
});

export const postmarkTriggerExecutor = definitionToExecutor(definition);

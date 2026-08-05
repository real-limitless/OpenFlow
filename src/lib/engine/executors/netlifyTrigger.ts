import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

/**
 * Netlify Trigger — outgoing-webhook trigger node.
 *
 * On activation the runtime should register a webhook URL via
 * POST /api/v1/hooks with the configured Netlify site for the selected events.
 * On deactivation it should deregister via DELETE /api/v1/hooks/{hookId}.
 *
 * This executor handles the per-invocation pass-through of webhook payloads.
 * Webhook lifecycle (activate/deactivate) is managed by the runner/trigger
 * infrastructure, not by this executor.
 */
const definition = defineNode({
  type: "n8n-nodes-base.netlifyTrigger",
  async execute(ctx) {
    const events = ctx.getParam("events") as string[] | undefined;
    const items = ctx.getInputItems(0);

    if (items.length === 0) {
      return [[]];
    }

    const out: INodeExecutionData[] = items.map((item) => ({
      json: item.json,
      binary: item.binary,
    }));

    return [out];
  },
});

export const netlifyTriggerExecutor = definitionToExecutor(definition);

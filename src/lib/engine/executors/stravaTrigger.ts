import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

interface StravaWebhookPayload {
  aspect_type: string;
  event_time: number;
  object_id: number;
  object_type: string;
  owner_id: number;
  subscription_id: number;
  updates: Record<string, unknown>;
}

const ASPECT_MAP: Record<string, string> = {
  Created: "create",
  Updated: "update",
  Deleted: "delete",
};

function matchesFilter(payload: StravaWebhookPayload, filter: string, triggerOn: string): boolean {
  if (filter !== "[All]") {
    const expected = filter.toLowerCase();
    if (payload.object_type !== expected) return false;
  }
  if (triggerOn !== "[All]") {
    const expected = ASPECT_MAP[triggerOn];
    if (!expected) return false;
    if (payload.aspect_type !== expected) return false;
  }
  return true;
}

const definition = defineNode({
  type: "n8n-nodes-base.stravaTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const filter = ctx.getParam<string>("filter", "[All]");
    const triggerOn = ctx.getParam<string>("triggerOn", "[All]");

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const payload = item.json as Partial<StravaWebhookPayload>;
      if (!payload.aspect_type || !payload.object_type) {
        continue;
      }
      if (!matchesFilter(payload as StravaWebhookPayload, filter, triggerOn)) {
        continue;
      }
      out.push({ json: payload as Record<string, unknown>, binary: item.binary });
    }

    return [out];
  },
});

export const stravaTriggerExecutor = definitionToExecutor(definition);

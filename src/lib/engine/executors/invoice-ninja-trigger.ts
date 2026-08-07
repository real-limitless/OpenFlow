import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const VALID_EVENTS = new Set([
  "create_client",
  "create_invoice",
  "create_payment",
  "create_quote",
  "create_vendor",
]);

const definition = defineNode({
  type: "n8n-nodes-base.invoiceNinjaTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const rawEvent = ctx.getParam<string>("event", "");
    const continueOnFail = ctx.continueOnFail();

    const event = typeof rawEvent === "string" && rawEvent.startsWith("=")
      ? String(ctx.evaluate(rawEvent) ?? "")
      : rawEvent;

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      try {
        const body = item.json as Record<string, unknown>;
        const eventType = body?.event_type as string | undefined;

        if (!eventType) {
          if (continueOnFail) {
            out.push({ json: { error: "Missing event_type in webhook payload" } });
            continue;
          }
          throw new Error("Missing event_type in webhook payload");
        }

        if (!VALID_EVENTS.has(eventType)) {
          if (continueOnFail) {
            out.push({ json: { error: `Unknown event: ${eventType}` } });
            continue;
          }
          throw new Error(`Unknown event: ${eventType}`);
        }

        if (event && event !== eventType) continue;

        out.push({ json: body as Record<string, unknown>, binary: item.binary });
      } catch (err) {
        if (continueOnFail) {
          out.push({ json: { error: (err as Error).message } });
        } else {
          throw err;
        }
      }
    }

    return [out];
  },
});

export const invoiceNinjaTriggerExecutor = definitionToExecutor(definition);

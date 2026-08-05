import { createHmac, timingSafeEqual } from "node:crypto";
import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

function verifySignature(body: string, signatureHeader: string, secret: string): boolean {
  const pairs = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split("=", 2);
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const timestamp = pairs.t;
  const providedSig = pairs.v1;
  if (!timestamp || !providedSig) return false;
  const maxAge = 300;
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || now - ts > maxAge) return false;
  const payload = `${timestamp}${body}`;
  const computedSig = createHmac("sha256", secret).update(payload).digest("hex");
  if (computedSig.length !== providedSig.length) return false;
  return timingSafeEqual(Buffer.from(computedSig), Buffer.from(providedSig));
}

const definition = defineNode({
  type: "n8n-nodes-base.mailchimpTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    if (items.length === 0) return [[]];

    const events = ctx.getParam<string[]>("events", []);
    const eventSet = events.length > 0 ? new Set(events) : null;
    const options = ctx.getParam<Record<string, unknown>>("options", {});
    const secret = options.secret as string | undefined;
    const resolveEvents = options.resolveEvents === true;
    const onlyFollowUp = options.onlyFollowUp === true;

    const out: INodeExecutionData[] = [];
    let pooledEvent: Record<string, unknown> | null = null;

    for (const item of items) {
      const payload = item.json as Record<string, unknown>;

      if (secret) {
        const sigHeader = (payload._mailchimpSignature as string) ?? "";
        const rawBody = (payload._rawBody as string) ?? "";
        if (!sigHeader || !verifySignature(rawBody, sigHeader, secret)) {
          continue;
        }
      }

      const eventType = String(payload.type ?? "");
      if (eventSet && !eventSet.has(eventType)) {
        continue;
      }

      if (onlyFollowUp && !payload._isFollowUp) {
        continue;
      }

      const outItem: Record<string, unknown> = {
        type: payload.type,
        fired_at: payload.fired_at,
        data: payload.data,
      };

      if (resolveEvents) {
        if (!pooledEvent) {
          pooledEvent = { events: [outItem] };
        } else {
          (pooledEvent.events as Record<string, unknown>[]).push(outItem);
        }
      } else {
        out.push({ json: outItem, binary: item.binary });
      }
    }

    if (pooledEvent) {
      out.push({ json: pooledEvent });
    }

    if (out.length === 0) return [[]];
    return [out];
  },
});

export const mailchimpTriggerExecutor = definitionToExecutor(definition);

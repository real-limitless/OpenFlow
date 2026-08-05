import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";
import crypto from "node:crypto";

const OBJECTS_REQUIRING_VALUES = new Set([
  "adAccount",
  "application",
  "certificateTransparency",
  "group",
  "instagram",
  "link",
  "page",
  "whatsappBusinessAccount",
  "workplaceSecurity",
]);

const definition = defineNode({
  type: "n8n-nodes-base.facebookTrigger",
  async execute(ctx) {
    const object = ctx.getParam<string>("object", "");
    const options = (ctx.getParam<Record<string, unknown>>("options", {}) ?? {}) as Record<string, unknown>;
    const includeValues = options.includeValues === true;

    if (OBJECTS_REQUIRING_VALUES.has(object) && !includeValues) {
      ctx.emitWarn?.(`The "${object}" object requires "Include Values" to be enabled for Meta to deliver complete payloads.`);
    }

    const items = ctx.getInputItems(0);
    const secretRaw = await ctx.getCredential("facebookGraphApi");
    const appSecret =
      secretRaw && typeof secretRaw === "object" && "appSecret" in secretRaw
        ? (secretRaw as Record<string, unknown>).appSecret as string | undefined
        : undefined;

    if (appSecret) {
      const webhookHeaders = ctx.getParam<Record<string, unknown>>("__webhookHeaders", undefined);
      const rawBody =
        webhookHeaders && typeof webhookHeaders.rawBody === "string"
          ? (webhookHeaders.rawBody as string)
          : items.length > 0
            ? JSON.stringify(items[0].json)
            : "{}";
      const sig =
        webhookHeaders && typeof webhookHeaders === "object"
          ? (webhookHeaders as Record<string, string>)["x-hub-signature-256"]
          : undefined;

      if (sig && !verifySignature(rawBody, appSecret, sig)) {
        ctx.emitError?.(new Error("X-Hub-Signature-256 mismatch — rejecting payload"));
        return [[]];
      }
    }

    const out: INodeExecutionData[] = items.map((item) => ({
      json: item.json,
      binary: item.binary,
    }));

    return [out];
  },
});

function verifySignature(body: string, secret: string, expected: string): boolean {
  const computed = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  return computed === expected;
}

export const facebookTriggerExecutor = definitionToExecutor(definition);

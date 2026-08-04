import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const DHL_API_BASE = "https://api-eu.dhl.com";

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

export const dhlExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "shipment");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      if (resource !== "shipment" || operation !== "get") {
        throw new Error(`Unsupported resource/operation: ${resource}/${operation}`);
      }

      const trackingNumber = String(node.parameters.trackingNumber ?? "");
      if (!trackingNumber) {
        throw new Error("trackingNumber is required");
      }

      const cred = await ctx.getCredential("dhlApi");
      const apiKey = cred?.apiKey as string | undefined;

      const params = new URLSearchParams();
      params.set("trackingNumber", trackingNumber);

      const options = node.parameters.options as Record<string, unknown> | undefined;
      if (options?.recipientPostalCode) {
        params.set("recipientPostalCode", String(options.recipientPostalCode));
      }

      const url = `${DHL_API_BASE}/track/shipments?${params.toString()}`;
      const headers: Record<string, string> = {
        accept: "application/json",
      };
      if (apiKey) {
        headers["dhl-api-key"] = apiKey;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`DHL API returned status ${res.status}`);
      }

      const body: unknown = await res.json();
      const payload = asObj(body);
      const shipments = (payload.shipments ?? [payload]) as Record<string, unknown>[];

      for (const shipment of shipments) {
        out.push({ json: shipment, pairedItem });
      }
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem,
        });
      } else {
        throw err;
      }
    }
  }

  return [out];
};

import type { NodeExecutor } from "@/sdk";

const MINNEE_V1_BASE = "https://api.mindee.net/v1/products";

function getEndpoint(resource: string): string {
  const product = resource === "invoice" ? "mindee_invoice" : "mindee_receipt";
  return `${MINNEE_V1_BASE}/${product}/predict`;
}

export const mindeeExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "invoice");
  const binaryProperty = ctx.getParam<string>("binaryProperty", "data");
  const options = ctx.getParam<Record<string, unknown>>("options", {});

  const outputs = [];

  for (const item of items) {
    const binaryData = item.binary?.[binaryProperty];
    if (!binaryData?.data) {
      if (ctx.continueOnFail()) {
        outputs.push({ json: { error: `Missing binary data on property "${binaryProperty}"`, ...item.json } });
        continue;
      }
      throw new Error(`Missing binary data on property "${binaryProperty}"`);
    }

    const credentialName = resource === "invoice" ? "mindeeInvoiceApi" : "mindeeReceiptApi";
    const cred = await ctx.getCredential(credentialName);

    const base64Data = binaryData.data;
    const mimeType = binaryData.mimeType ?? "application/octet-stream";

    const body = new FormData();
    const blob = new Blob([Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))], { type: mimeType });
    body.append("document", blob, "document");

    const headers: Record<string, string> = {};
    if (cred?.apiKey) {
      headers["Authorization"] = cred.apiKey as string;
    }

    const response = await fetch(getEndpoint(resource), {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      if (ctx.continueOnFail()) {
        outputs.push({
          json: {
            error: `Mindee API error: ${response.status} ${response.statusText}`,
            errorBody,
            ...item.json,
          },
        });
        continue;
      }
      throw new Error(`Mindee API error: ${response.status} ${response.statusText}${errorBody ? ` — ${errorBody}` : ""}`);
    }

    const result = await response.json();

    const prediction = result?.document?.inference?.prediction ?? result?.document ?? result ?? {};

    const flattenPrediction: Record<string, unknown> = {};

    if (typeof prediction === "object" && prediction !== null) {
      for (const [key, val] of Object.entries(prediction)) {
        if (val && typeof val === "object" && "value" in (val as Record<string, unknown>)) {
          flattenPrediction[key] = (val as Record<string, unknown>).value;
        } else {
          flattenPrediction[key] = val;
        }
      }
    }

    if (options.rawText) {
      flattenPrediction.raw_text = result?.document?.inference?.raw_text ?? null;
    }

    outputs.push({
      json: {
        ...item.json,
        ...flattenPrediction,
      },
      binary: item.binary,
    });
  }

  return [outputs];
};

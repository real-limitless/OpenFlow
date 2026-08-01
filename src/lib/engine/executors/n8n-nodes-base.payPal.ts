import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_LIVE = "https://api-m.paypal.com";
const API_SANDBOX = "https://api-m.sandbox.paypal.com";

interface PayPalCredential {
  clientId: string;
  secret: string;
  environment: string;
}

async function getAccessToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("payPal");
  if (!cred) throw new Error("PayPal: credential is required");
  const data = cred as unknown as PayPalCredential;
  const clientId = data.clientId;
  const secret = data.secret;
  if (!clientId || !secret) throw new Error("PayPal: clientId and secret are required");
  const env = data.environment || "sandbox";
  const base = env === "live" || env === "production" ? API_LIVE : API_SANDBOX;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: controller.signal,
    });
    const text = await resp.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { }
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`PayPal auth failed: ${(parsed as any).error_description ?? resp.status}`);
    }
    return String((parsed as any).access_token ?? "");
  } finally {
    clearTimeout(timer);
  }
}

async function payPalFetch(
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    const text = await resp.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { }
    if (resp.status < 200 || resp.status >= 300) {
      const obj = (parsed ?? {}) as Record<string, unknown>;
      const errMsg = String(
        (obj as any).message ?? (obj as any).error_description ?? `PayPal request failed ${resp.status}`,
      );
      const error = new Error(errMsg);
      (error as any).statusCode = resp.status;
      (error as any).details = obj;
      throw error;
    }
    return (parsed ?? {}) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

export const payPalExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail?.() ?? false;

  const accessToken = await getAccessToken(ctx);
  const cred = await ctx.getCredential("payPal");
  const env = ((cred as unknown as PayPalCredential)?.environment) || "sandbox";
  const base = env === "live" || env === "production" ? API_LIVE : API_SANDBOX;

  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const pairedItem = item.pairedItem ?? { item: i, input: 0 };

    try {
      const operation = String(node.parameters.operation ?? "createBatchPayout");
      const params = (node.parameters ?? {}) as Record<string, unknown>;

      let result: Record<string, unknown>;

      switch (operation) {
        case "createBatchPayout": {
          const senderBatchHeader = (params.senderBatchHeader ?? {}) as Record<string, unknown>;
          const rawItems = (params.items ?? []) as Array<Record<string, unknown>>;

          const body: Record<string, unknown> = {
            sender_batch_header: {
              email_subject: senderBatchHeader.emailSubject ?? senderBatchHeader.email_subject ?? "You have a payout",
              sender_batch_id: senderBatchHeader.senderBatchId ?? senderBatchHeader.sender_batch_id ?? `batch-${Date.now()}`,
            },
            items: rawItems.map((ri) => {
              const amount = (ri.amount ?? {}) as Record<string, unknown>;
              return {
                recipient_type: ri.recipientType ?? ri.recipient_type ?? "EMAIL",
                receiver: ri.receiver ?? ri.receiver ?? "",
                amount: {
                  value: String(amount.value ?? "0.00"),
                  currency: String(amount.currency ?? "USD"),
                },
              };
            }),
          };

          result = await payPalFetch(`${base}/v1/payments/payouts`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify(body),
          });
          break;
        }

        case "showBatchPayoutDetails": {
          const batchHeader = (params.batchHeader ?? {}) as Record<string, unknown>;
          const payoutBatchId = String(
            params.payoutBatchId ?? batchHeader.payoutBatchId ?? batchHeader.payout_batch_id ?? "",
          );
          if (!payoutBatchId) throw new Error("Missing required identifier: payoutBatchId");
          result = await payPalFetch(`${base}/v1/payments/payouts/${payoutBatchId}`, {
            method: "GET",
            headers: authHeaders,
          });
          break;
        }

        case "cancelPayoutItem": {
          const payoutItemId = String(params.payoutItemId ?? "");
          if (!payoutItemId) throw new Error("Missing required identifier: payoutItemId");
          result = await payPalFetch(`${base}/v1/payments/payouts-item/${payoutItemId}/cancel`, {
            method: "POST",
            headers: authHeaders,
          });
          break;
        }

        case "showPayoutItemDetails": {
          const payoutItemId = String(params.payoutItemId ?? "");
          if (!payoutItemId) throw new Error("Missing required identifier: payoutItemId");
          result = await payPalFetch(`${base}/v1/payments/payouts-item/${payoutItemId}`, {
            method: "GET",
            headers: authHeaders,
          });
          break;
        }

        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      out.push({ json: result as Record<string, unknown>, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      out.push({
        json: { error: err instanceof Error ? err.message : String(err) },
        pairedItem,
      });
    }
  }

  return [out];
};

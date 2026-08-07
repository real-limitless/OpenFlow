import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";
import type { INode } from "@/lib/workflow/types";

interface PaddleCredential {
  vendorAuthCode: string;
  vendorId: string;
  sandbox?: boolean;
}

function buildBaseUrl(cred: PaddleCredential): string {
  return cred.sandbox
    ? "https://sandbox-vendors.paddle.com/api/2.0"
    : "https://vendors.paddle.com/api/2.0";
}

async function paddleApiCall(
  cred: PaddleCredential,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const baseUrl = buildBaseUrl(cred);
  const url = `${baseUrl}/${path}`;
  const formBody = new URLSearchParams({
    vendor_id: cred.vendorId,
    vendor_auth_code: cred.vendorAuthCode,
  });
  if (body) {
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null && v !== "") {
        formBody.set(k, String(v));
      }
    }
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody.toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paddle API error (${response.status}): ${text}`);
  }
  return response.json();
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function("$json", "return " + raw.replace(/^\s*=\s*/, "").replace(/\{\{([\s\S]*?)\}\}/g, "$1"));
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

export const paddleExecutor: NodeExecutor = async (
  ctx: ExecutionContext,
  node: INode,
) => {
  const items = ctx.getInputItems();
  const outputs: INodeExecutionData[] = [];

  const resource = String(ctx.getParam("resource") ?? "coupon");
  const operation = String(ctx.getParam("operation") ?? "getAll");

  const cred = await ctx.getCredential("paddleApi");
  if (!cred) {
    throw new Error("Credential 'paddleApi' is required");
  }
  const paddleCred = cred as unknown as PaddleCredential;

  for (const item of items) {
    try {
      const itemJson = item.json ?? {};
      const couponId = String(resolveValue(ctx.getParam("couponId"), itemJson) ?? "");
      const paymentId = String(resolveValue(ctx.getParam("paymentId"), itemJson) ?? "");
      const planId = String(resolveValue(ctx.getParam("planId"), itemJson) ?? "");
      const date = String(resolveValue(ctx.getParam("date"), itemJson) ?? "");
      const additionalFields = ctx.getParam("additionalFields") as Record<string, unknown> | undefined;

      let body: Record<string, unknown> = {};
      if (additionalFields) {
        for (const [k, v] of Object.entries(additionalFields)) {
          if (v !== undefined && v !== null && v !== "") {
            body[k] = v;
          }
        }
      }

      let result: unknown;

      switch (resource) {
        case "coupon": {
          switch (operation) {
            case "create":
              result = await paddleApiCall(paddleCred, "product/create_coupon", body);
              break;
            case "getAll":
              result = await paddleApiCall(paddleCred, "product/list_coupons", body);
              break;
            case "update":
              if (!couponId) {
                throw new Error("Coupon ID is required for update operation");
              }
              body = { coupon_id: couponId, ...body };
              result = await paddleApiCall(paddleCred, "product/update_coupon", body);
              break;
            default:
              throw new Error(`Unknown coupon operation: ${operation}`);
          }
          break;
        }
        case "payment": {
          switch (operation) {
            case "getAll":
              result = await paddleApiCall(paddleCred, "subscription/payments", body);
              break;
            case "reschedule":
              if (!paymentId) {
                throw new Error("Payment ID is required for reschedule operation");
              }
              if (!date) {
                throw new Error("Date is required for reschedule operation");
              }
              result = await paddleApiCall(paddleCred, "subscription/payments_reschedule", {
                payment_id: paymentId,
                date,
              });
              break;
            default:
              throw new Error(`Unknown payment operation: ${operation}`);
          }
          break;
        }
        case "plan": {
          switch (operation) {
            case "get":
              if (!planId) {
                throw new Error("Plan ID is required for get operation");
              }
              body = { plan: planId, ...body };
              result = await paddleApiCall(paddleCred, "subscription/plans", body);
              break;
            case "getAll":
              result = await paddleApiCall(paddleCred, "subscription/plans", body);
              break;
            default:
              throw new Error(`Unknown plan operation: ${operation}`);
          }
          break;
        }
        case "product": {
          if (operation !== "getAll") {
            throw new Error(`Unknown product operation: ${operation}`);
          }
          result = await paddleApiCall(paddleCred, "product/get_products", body);
          break;
        }
        case "user": {
          if (operation !== "getAll") {
            throw new Error(`Unknown user operation: ${operation}`);
          }
          result = await paddleApiCall(paddleCred, "subscription/users", body);
          break;
        }
        default:
          throw new Error(`Unknown resource: ${resource}`);
      }

      outputs.push({ json: result as Record<string, unknown> });
    } catch (error) {
      if (ctx.continueOnFail()) {
        outputs.push({ json: {} });
      } else {
        throw error;
      }
    }
  }

  return [outputs];
};

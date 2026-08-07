import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";
import type { INode } from "@/lib/workflow/types";

interface PaddleCredential {
  vendorAuthCode: string;
  vendorId: string;
  sandbox?: boolean;
}

function buildBaseUrl(cred: PaddleCredential): string {
  return cred.sandbox
    ? "https://sandbox-api.paddle.com/classic/api"
    : "https://api.paddle.com/classic/api";
}

function buildAuthQuery(cred: PaddleCredential): string {
  const params = new URLSearchParams({
    vendor_id: cred.vendorId,
    vendor_auth_code: cred.vendorAuthCode,
  });
  return params.toString();
}

async function paddleApiCall(
  cred: PaddleCredential,
  path: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>,
): Promise<unknown> {
  const baseUrl = buildBaseUrl(cred);
  const authQuery = buildAuthQuery(cred);
  const url = `${baseUrl}/${path}?${authQuery}`;

  const fetchInit: RequestInit = { method };
  if (method === "POST" && body) {
    const formBody = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      formBody.set(k, String(v ?? ""));
    }
    fetchInit.body = formBody.toString();
    fetchInit.headers = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  const response = await fetch(url, fetchInit);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paddle API error (${response.status}): ${text}`);
  }

  return response.json();
}

export const paddleToolExecutor: NodeExecutor = async (
  ctx: ExecutionContext,
  node: INode,
) => {
  const items = ctx.getInputItems();
  const outputs: INodeExecutionData[] = [];

  const resource = String(ctx.getParam("resource") ?? "");
  const operation = String(ctx.getParam("operation") ?? "");
  const additionalFields = ctx.getParam("additionalFields") as Record<string, unknown> | undefined;

  const cred = await ctx.getCredential("paddleApi");
  if (!cred) {
    throw new Error("Credential 'paddleApi' is required");
  }
  const paddleCred = cred as unknown as PaddleCredential;

  for (const item of items) {
    try {
      const couponId = String(ctx.getParam("couponId") ?? item.json.couponId ?? "") || undefined;
      const paymentId = String(ctx.getParam("paymentId") ?? item.json.paymentId ?? "") || undefined;
      const planId = String(ctx.getParam("planId") ?? item.json.planId ?? "") || undefined;
      const date = String(ctx.getParam("date") ?? item.json.date ?? "") || undefined;

      let result: unknown;

      switch (resource) {
        case "coupon": {
          switch (operation) {
            case "create":
              result = await paddleApiCall(paddleCred, "2.0/product/create_coupon", "POST", {
                ...additionalFields,
              });
              break;
            case "getAll":
              result = await paddleApiCall(paddleCred, "2.0/product/list_coupons", "POST", {
                ...additionalFields,
              });
              break;
            case "update":
              if (!couponId) {
                throw new Error("Coupon ID is required for update operation");
              }
              result = await paddleApiCall(paddleCred, "2.0/product/update_coupon", "POST", {
                coupon_id: couponId,
                ...additionalFields,
              });
              break;
            default:
              throw new Error(`Unknown coupon operation: ${operation}`);
          }
          break;
        }
        case "payment": {
          switch (operation) {
            case "getAll":
              result = await paddleApiCall(paddleCred, "2.0/subscription/payments", "POST", {
                ...additionalFields,
              });
              break;
            case "reschedule":
              if (!paymentId) {
                throw new Error("Payment ID is required for reschedule operation");
              }
              if (!date) {
                throw new Error("Date is required for reschedule operation");
              }
              result = await paddleApiCall(paddleCred, "2.0/subscription/payments_reschedule", "POST", {
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
              result = await paddleApiCall(paddleCred, "2.0/subscription/plans", "POST", {
                plan: planId,
              });
              break;
            case "getAll":
              result = await paddleApiCall(paddleCred, "2.0/subscription/plans", "POST", {
                ...additionalFields,
              });
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
          result = await paddleApiCall(paddleCred, "2.0/product/get_products", "POST", {
            ...additionalFields,
          });
          break;
        }
        case "user": {
          if (operation !== "getAll") {
            throw new Error(`Unknown user operation: ${operation}`);
          }
          result = await paddleApiCall(paddleCred, "2.0/subscription/users", "POST", {
            ...additionalFields,
          });
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

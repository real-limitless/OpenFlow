import type { NodeExecutor } from "@/sdk";
import { requireCredential } from "@/sdk";
import { sdkHttpRequest } from "@/sdk";

export const vonageExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const continueOnFail = ctx.continueOnFail();

  const cred = await requireCredential(ctx, "vonageApi");
  const apiKey = cred.apiKey as string;
  const apiSecret = cred.apiSecret as string;

  const results: Array<{ json: Record<string, unknown> }> = [];

  for (const item of items) {
    try {
      const from = ctx.getParam<string>("from", "");
      const to = ctx.getParam<string>("to", "");
      const message = ctx.getParam<string>("message", "");

      const options = (ctx.getParam<Record<string, unknown>>("options") ?? {}) as Record<string, unknown>;

      const body = new URLSearchParams();
      body.set("api_key", apiKey);
      body.set("api_secret", apiSecret);
      body.set("from", from);
      body.set("to", to);
      body.set("text", message);

      const msgType = options.type as string | undefined;
      if (msgType) body.set("type", msgType);

      const ttl = options.ttl;
      if (ttl != null && ttl !== "") body.set("ttl", String(ttl));

      const statusCallbackUrl = options.statusCallbackUrl as string | undefined;
      if (statusCallbackUrl) {
        body.set("status-report-req", "1");
        body.set("callback", statusCallbackUrl);
      }

      const clientRef = options.clientRef as string | undefined;
      if (clientRef) body.set("client-ref", clientRef);

      const response = await sdkHttpRequest({
        method: "POST",
        url: "https://rest.nexmo.com/sms/json",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      const json = response.body as Record<string, unknown>;
      const messages = json.messages as Array<Record<string, unknown>> | undefined;

      if (messages && messages.length > 0) {
        const first = messages[0];
        if (first.status !== "0") {
          throw new Error(
            `Vonage SMS error: status=${first.status}, error-text=${first["error-text"] ?? "unknown"}`,
          );
        }
      }

      results.push({
        json: {
          ...item.json,
          ...json,
        },
      });
    } catch (err) {
      if (continueOnFail) {
        results.push({
          json: {
            ...item.json,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      } else {
        throw err;
      }
    }
  }

  return [results];
};

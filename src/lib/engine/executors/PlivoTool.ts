import type { NodeExecutor } from "@/sdk";
import { sdkHttpRequest } from "@/sdk/helpers/http";

export const plivoToolExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  if (items.length === 0) {
    return [[]];
  }

  const resource = ctx.getParam("resource", "sms") as string;
  const credential = await ctx.getCredential("plivoApi");
  if (!credential) {
    if (ctx.continueOnFail()) {
      return [items.map(() => ({ json: { error: "Missing plivoApi credential" } }))];
    }
    throw new Error("Missing plivoApi credential");
  }

  const authId = credential.authId as string;
  const authToken = credential.authToken as string;

  if (!authId || !authToken) {
    if (ctx.continueOnFail()) {
      return [items.map(() => ({ json: { error: "Missing authId or authToken in credential" } }))];
    }
    throw new Error("Missing authId or authToken in credential");
  }

  const basicAuth = Buffer.from(`${authId}:${authToken}`).toString("base64");
  const headers: Record<string, string> = {
    Authorization: `Basic ${basicAuth}`,
    "Content-Type": "application/json",
  };

  if (resource === "call") {
    const outItems = [];
    for (const item of items) {
      try {
        const from = ctx.getParam("from") as string;
        const to = ctx.getParam("to") as string;
        const answerUrl = ctx.getParam("answer_url") as string;
        const answerMethod = (ctx.getParam("answer_method", "POST") as string) ?? "POST";

        if (!from || !to || !answerUrl) {
          if (ctx.continueOnFail()) {
            outItems.push({ json: { error: "from, to, and answer_url are required for call" } });
            continue;
          }
          throw new Error("from, to, and answer_url are required for call");
        }

        const response = await sdkHttpRequest({
          method: "POST",
          url: `https://api.plivo.com/v1/Account/${authId}/Call/`,
          headers,
          body: { from, to, answer_url: answerUrl, answer_method: answerMethod },
        });
        outItems.push({ json: response.body as Record<string, unknown> });
      } catch (err) {
        if (ctx.continueOnFail()) {
          outItems.push({ json: { error: (err as Error).message } });
        } else {
          throw err;
        }
      }
    }
    return [outItems];
  }

  if (resource === "sms" || resource === "mms") {
    const outItems = [];
    for (const item of items) {
      try {
        const from = ctx.getParam("from") as string;
        const to = ctx.getParam("to") as string;

        if (!from || !to) {
          if (ctx.continueOnFail()) {
            outItems.push({ json: { error: "from and to are required for SMS/MMS" } });
            continue;
          }
          throw new Error("from and to are required for SMS/MMS");
        }

        const body: Record<string, unknown> = { src: from, dst: to };

        if (resource === "mms") {
          body.type = "mms";
          const text = ctx.getParam("message") as string | undefined;
          if (text) body.text = text;
          const mediaUrls = ctx.getParam("media_urls") as string | undefined;
          if (mediaUrls) body.media_urls = mediaUrls;
        } else {
          const text = ctx.getParam("message") as string;
          if (!text) {
            if (ctx.continueOnFail()) {
              outItems.push({ json: { error: "message is required for SMS" } });
              continue;
            }
            throw new Error("message is required for SMS");
          }
          body.text = text;
        }

        const response = await sdkHttpRequest({
          method: "POST",
          url: `https://api.plivo.com/v1/Account/${authId}/Message/`,
          headers,
          body,
        });
        outItems.push({ json: response.body as Record<string, unknown> });
      } catch (err) {
        if (ctx.continueOnFail()) {
          outItems.push({ json: { error: (err as Error).message } });
        } else {
          throw err;
        }
      }
    }
    return [outItems];
  }

  if (ctx.continueOnFail()) {
    return [items.map(() => ({ json: { error: `Unsupported resource: ${resource}` } }))];
  }
  throw new Error(`Unsupported resource: ${resource}`);
};

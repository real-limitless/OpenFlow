import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { sdkHttpRequest } from "@/sdk";

const API_ACTIONS: Record<string, string> = {
  shorten: "shorturl",
  expand: "expand",
  stats: "url-stats",
};

export const yourlsToolExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "url");
  const operation = ctx.getParam<string>("operation", "shorten");
  const apiAction = API_ACTIONS[operation];
  const continueOnFail = ctx.continueOnFail();

  if (resource !== "url") {
    throw new Error(`YOURLS Tool: unsupported resource "${resource}"`);
  }
  if (!apiAction) {
    throw new Error(`YOURLS Tool: unsupported operation "${operation}"`);
  }

  const credential = await ctx.getCredential("yourlsApi");
  if (!credential) {
    throw new Error("YOURLS Tool: yourlsApi credential is not configured");
  }
  const signature = String(credential.signature ?? credential.apiKey ?? "");
  const instanceUrl = String(credential.url ?? credential.instanceUrl ?? "");
  if (!signature || !instanceUrl) {
    throw new Error("YOURLS Tool: yourlsApi credential must include signature and url");
  }

  const output: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    try {
      const params: Record<string, string> = {
        action: apiAction,
        signature,
        format: "json",
      };

      if (operation === "shorten") {
        const url = String(ctx.getParam("url", "") ?? "");
        if (!url) {
          throw new Error("YOURLS Tool: url parameter is required for shorten operation");
        }
        params.url = url;
        const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {}) ?? {};
        if (additionalFields.keyword) {
          params.keyword = String(additionalFields.keyword);
        }
        if (additionalFields.title) {
          params.title = String(additionalFields.title);
        }
      } else {
        const shortUrl = String(ctx.getParam("shortUrl", "") ?? "");
        if (!shortUrl) {
          throw new Error(`YOURLS Tool: shortUrl parameter is required for ${operation} operation`);
        }
        params.shorturl = shortUrl;
      }

      const qs = new URLSearchParams(params).toString();
      const apiUrl = `${instanceUrl.replace(/\/$/, "")}/yourls-api.php?${qs}`;

      const response = await sdkHttpRequest({
        method: "GET",
        url: apiUrl,
        headers: { Accept: "application/json" },
      });

      const body = (response.body ?? {}) as Record<string, unknown>;
      if (body.status === "fail") {
        throw new Error(`YOURLS API error: ${body.message ?? "unknown error"}`);
      }

      let resultJson: Record<string, unknown>;
      if (operation === "stats" && body.link && typeof body.link === "object") {
        resultJson = body.link as Record<string, unknown>;
      } else {
        resultJson = body;
      }

      output.push({ json: resultJson, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      output.push({ json: { error: message }, pairedItem });
    }
  }

  return [output];
};
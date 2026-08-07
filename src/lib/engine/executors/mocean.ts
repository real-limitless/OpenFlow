import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://rest.moceanapi.com/rest/2";

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function moceanRequest(
  apiKey: string,
  apiSecret: string,
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const body = new URLSearchParams({
      "mocean-api-key": apiKey,
      "mocean-api-secret": apiSecret,
      "mocean-resp-format": "JSON",
      ...params,
    });
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = String(
        (obj.error as Record<string, unknown> | undefined)?.message ??
          obj.err_msg ??
          obj.message ??
          obj.error ??
          `Mocean request failed with status code ${response.status}`,
      );
      throw new Error(errMsg);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export const moceanExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("moceanApi");
  if (!cred) throw new Error("Mocean: moceanApi credential is required");
  const apiKey = String((cred as Record<string, unknown>).apiKey ?? "");
  const apiSecret = String((cred as Record<string, unknown>).apiSecret ?? "");
  if (!apiKey || !apiSecret) throw new Error("Mocean: apiKey and apiSecret are required in credential");

  const resource = String(node.parameters.resource ?? "sms");
  const operation = String(node.parameters.operation ?? "send");

  if (operation !== "send") {
    throw new Error(`Mocean: unsupported operation "${operation}"`);
  }

  const path = "/sms/send";

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    try {
      const from = String(node.parameters.from ?? "");
      const to = String(node.parameters.to ?? "");
      const message = String(node.parameters.message ?? "");
      if (!from) throw new Error("Mocean: 'from' parameter is required");
      if (!to) throw new Error("Mocean: 'to' parameter is required");
      if (!message) throw new Error("Mocean: 'message' parameter is required");

      const apiParams: Record<string, string> = {
        "mocean-from": from,
        "mocean-to": to,
        "mocean-text": message,
      };

      if (resource === "voice") {
        const language = String(node.parameters.language ?? "en-US");
        const ttsCommand = JSON.stringify({
          "mocean-tts-lang": language,
          "mocean-tts-text": message,
        });
        apiParams["mocean-command"] = ttsCommand;
      }

      const options = (node.parameters.options as Record<string, unknown>) ?? {};
      const dlrUrl = options.dlrUrl;
      if (dlrUrl) {
        apiParams["mocean-dlr-url"] = String(dlrUrl);
      }

      const result = await moceanRequest(apiKey, apiSecret, path, apiParams);
      const resultBody = asObj(result);
      out.push({ json: { ...itemJson, ...resultBody }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { ...itemJson, error: { message } }, pairedItem });
    }
  }

  return [out];
};

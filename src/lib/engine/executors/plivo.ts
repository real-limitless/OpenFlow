import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.plivo.com/v1/Account";

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function plivoRequest(
  authId: string,
  authToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${API_BASE}${path}`;
  const encoded = btoa(`${authId}:${authToken}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Basic ${encoded}`,
        Accept: "application/json",
      },
    };
    if (body !== undefined && method !== "GET") {
      (init.headers as Record<string, string>)["Content-Type"] = "application/json; charset=utf-8";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
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
        obj.error ?? obj.message ?? `Plivo request failed with status code ${response.status}`,
      );
      throw new Error(errMsg);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export const plivoExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("plivoApi");
  if (!cred) throw new Error("Plivo: plivoApi credential is required");
  const credData = cred as Record<string, unknown>;
  const authId = String(credData.authId ?? credData.username ?? "");
  const authToken = String(credData.authToken ?? credData.password ?? "");
  if (!authId || !authToken) throw new Error("Plivo: authId and authToken are required in credential");

  const resource = String(node.parameters.resource ?? "sms");
  const operation = String(node.parameters.operation ?? (resource === "call" ? "make" : "send"));

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const from = String(node.parameters.from ?? "");
      const to = String(node.parameters.to ?? "");

      if (resource === "sms" && operation === "send") {
        const message = String(node.parameters.message ?? "");
        const result = await plivoRequest(authId, authToken, "POST", `/${authId}/Message/`, {
          src: from,
          dst: to,
          text: message,
        });
        const resultBody = asObj(result);
        out.push({ json: { ...itemJson, ...resultBody }, pairedItem });
      } else if (resource === "mms" && operation === "send") {
        const message = String(node.parameters.message ?? "");
        const mediaUrls = String(node.parameters.media_urls ?? "");
        const requestBody: Record<string, unknown> = {
          src: from,
          dst: to,
          text: message,
          type: "mms",
        };
        if (mediaUrls) {
          requestBody.media_urls = mediaUrls;
        }
        const result = await plivoRequest(authId, authToken, "POST", `/${authId}/Message/`, requestBody);
        const resultBody = asObj(result);
        out.push({ json: { ...itemJson, ...resultBody }, pairedItem });
      } else if (resource === "call" && operation === "make") {
        const answerUrl = String(node.parameters.answer_url ?? "");
        const answerMethod = String(node.parameters.answer_method ?? "POST");
        const result = await plivoRequest(authId, authToken, "POST", `/${authId}/Call/`, {
          from,
          to,
          answer_url: answerUrl,
          answer_method: answerMethod,
        });
        const resultBody = asObj(result);
        out.push({ json: { ...itemJson, ...resultBody }, pairedItem });
      } else {
        throw new Error(`Plivo: unsupported resource "${resource}" / operation "${operation}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { ...itemJson, error: { message } }, pairedItem });
    }
  }

  return [out];
};
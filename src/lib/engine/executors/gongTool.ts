import type { NodeExecutor } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const GONG_API_BASE = "https://api.gong.io/v2";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

async function gongFetch(
  path: string,
  creds: Record<string, unknown>,
  method = "GET",
): Promise<unknown> {
  const accessKey = creds.accessKey as string | undefined;
  const secretKey = creds.secretKey as string | undefined;
  const accessToken = creds.accessToken as string | undefined;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (accessKey && secretKey) {
    const encoded = Buffer.from(`${accessKey}:${secretKey}`).toString("base64");
    headers["Authorization"] = `Basic ${encoded}`;
  } else if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const url = `${GONG_API_BASE}${path}`;
  const res = await fetch(url, { method, headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gong API error ${res.status}: ${body}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

function buildCallUrl(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): string {
  const operation = params.operation as string;
  if (operation === "get") {
    const callId = String(resolveValue(params.callId, itemJson) ?? "");
    if (!callId) throw new Error("callId is required for Call > Get");
    return `/calls/${encodeURIComponent(callId)}`;
  }
  const qs = new URLSearchParams();
  if (params.fromDateTime) qs.set("fromDateTime", String(resolveValue(params.fromDateTime, itemJson)));
  if (params.toDateTime) qs.set("toDateTime", String(resolveValue(params.toDateTime, itemJson)));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return `/calls${query ? `?${query}` : ""}`;
}

function buildUserUrl(
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): string {
  const operation = params.operation as string;
  if (operation === "get") {
    const userId = String(resolveValue(params.userId, itemJson) ?? "");
    if (!userId) throw new Error("userId is required for User > Get");
    return `/users/${encodeURIComponent(userId)}`;
  }
  return "/users";
}

export const gongToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "call");
  const operation = ctx.getParam<string>("operation", "get");
  const continueOnFail = ctx.continueOnFail();

  const cred =
    (await ctx.getCredential("gongApi")) ??
    (await ctx.getCredential("gongOAuth2Api"));
  if (!cred) {
    throw new Error("Gong credential (gongApi or gongOAuth2Api) is not configured");
  }

  const results: Array<{ json: Record<string, unknown>; error?: string }> = [];

  for (const item of inputItems) {
    try {
      const itemJson = item.json ?? {};
      const allParams = { ...ctx.getParams(), ...itemJson };
      allParams.resource = resource;
      allParams.operation = operation;

      const path =
        resource === "user" ? buildUserUrl(allParams, itemJson) : buildCallUrl(allParams, itemJson);
      const data = (await gongFetch(path, cred)) as Record<string, unknown>;

      if (operation === "getMany") {
        const key = resource === "user" ? "users" : "calls";
        results.push({ json: { [key]: (data as Record<string, unknown>)[key] ?? [] } });
      } else {
        results.push({ json: data });
      }
    } catch (e) {
      if (continueOnFail) {
        results.push({ json: { error: (e as Error).message } });
      } else {
        throw e;
      }
    }
  }

  return [results];
};

import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { sdkHttpRequest, ensureItems } from "@/sdk";

const FIREBASE_REST_BASE = "https://<project>.firebaseio.com";

interface FirebaseCredentials {
  accessToken?: string;
  data?: Record<string, unknown>;
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function resolveValue(
  raw: unknown,
  itemJson: Record<string, unknown>,
  ctx: { evaluate: (expr: string, json: Record<string, unknown>) => unknown },
): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    return ctx.evaluate(raw, itemJson);
  }
  return raw;
}

function parseAttributes(
  raw: unknown,
  itemJson: Record<string, unknown>,
  ctx: { evaluate: (expr: string, json: Record<string, unknown>) => unknown },
): Record<string, unknown> {
  const resolved = resolveValue(raw, itemJson, ctx);
  const attrsStr = asString(resolved, "");
  if (!attrsStr) return itemJson;
  const keys = attrsStr.split(",").map((k) => k.trim()).filter(Boolean);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in itemJson) {
      result[key] = itemJson[key];
    }
  }
  return result;
}

export const googleFirebaseRealtimeDatabaseExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();
  const out: INodeExecutionData[] = [];

  const projectId = asString(ctx.getParam("projectId"));
  const operation = asString(ctx.getParam("operation"));
  const path = asString(ctx.getParam("path"));

  if (!projectId) throw new Error("Project ID is required.");

  const credential = await ctx.getCredential("googleFirebaseRealtimeDatabaseOAuth2Api") as FirebaseCredentials | null;
  const accessToken =
    credential?.accessToken ??
    (credential?.data as Record<string, unknown>)?.accessToken ??
    (await ctx.getCredential("googleApi"))?.accessToken ??
    "";

  const baseUrl = FIREBASE_REST_BASE.replace("<project>", projectId);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  for (const item of items) {
    try {
      const resolvedPath = asString(resolveValue(ctx.getParam("path"), item.json, ctx));

      switch (operation) {
        case "create": {
          const attributes = parseAttributes(ctx.getParam("attributes"), item.json, ctx);
          const url = `${baseUrl}${resolvedPath}.json`;
          const res = await sdkHttpRequest({ method: "PUT", url, headers, body: attributes });
          if (res.status < 200 || res.status >= 300) throw apiError(res);
          out.push({ json: res.body as Record<string, unknown> });
          break;
        }

        case "delete": {
          const url = `${baseUrl}${resolvedPath}.json`;
          const res = await sdkHttpRequest({ method: "DELETE", url, headers });
          if (res.status < 200 || res.status >= 300) throw apiError(res);
          out.push({ json: res.body as Record<string, unknown> });
          break;
        }

        case "get": {
          const url = `${baseUrl}${resolvedPath}.json`;
          const res = await sdkHttpRequest({ method: "GET", url, headers });
          if (res.status < 200 || res.status >= 300) throw apiError(res);
          out.push({ json: res.body as Record<string, unknown> });
          break;
        }

        case "push": {
          const attributes = parseAttributes(ctx.getParam("attributes"), item.json, ctx);
          const url = `${baseUrl}${resolvedPath}.json`;
          const res = await sdkHttpRequest({ method: "POST", url, headers, body: attributes });
          if (res.status < 200 || res.status >= 300) throw apiError(res);
          out.push({ json: res.body as Record<string, unknown> });
          break;
        }

        case "update": {
          const attributes = parseAttributes(ctx.getParam("attributes"), item.json, ctx);
          const url = `${baseUrl}${resolvedPath}.json`;
          const res = await sdkHttpRequest({ method: "PATCH", url, headers, body: attributes });
          if (res.status < 200 || res.status >= 300) throw apiError(res);
          out.push({ json: res.body as Record<string, unknown> });
          break;
        }

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (err) {
      if (continueOnFail) {
        out.push({ json: { error: err instanceof Error ? err.message : String(err) } });
      } else {
        throw err;
      }
    }
  }

  return [out];
};

function apiError(res: { status: number; body?: unknown }): Error {
  const errBody = res.body as Record<string, unknown> | undefined;
  const msg =
    ((errBody?.error as Record<string, unknown>)?.message as string) ??
    `Firebase Realtime Database API returned HTTP ${res.status}`;
  return new Error(msg);
}

import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";

const API_BASE = "https://api.cloudflare.com/client/v4";

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("cloudflareApi");
  const token = cred ? String(cred.apiToken ?? cred.apiKey ?? cred.token ?? "") : "";
  if (!token) throw new Error("Cloudflare Tool: cloudflareApi credential is not configured");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function resolveParam(
  ctx: ExecutionContext,
  name: string,
  itemJson: Record<string, unknown>,
): unknown {
  const raw = ctx.getParam(name);
  if (typeof raw === "string" && raw.startsWith("={{") && raw.endsWith("}}")) {
    return ctx.evaluate(raw, itemJson);
  }
  return raw;
}

async function cfRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${API_BASE}${path}`, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Cloudflare request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

function processCfError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const msgs = Array.isArray(obj.errors) ? obj.errors : [];
  const msg = msgs.length > 0 && typeof msgs[0] === "object"
    ? String((msgs[0] as Record<string, unknown>).message ?? "")
    : `HTTP ${status}`;
  return new Error(`Cloudflare: ${msg}`);
}

async function requestOk(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const res = await cfRequest(method, path, headers, body);
  if (res.status < 200 || res.status >= 300) throw processCfError(res.body, res.status);
  return asObj(res.body);
}

export const cloudflareToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];
  const operation = String(node.parameters.operation ?? "upload");
  const continueOnFail = ctx.continueOnFail();

  const headers = await authHeaders(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: Record<string, unknown>;

      const zoneId = String(resolveParam(ctx, "zoneId", itemJson) ?? "");
      if (!zoneId) throw new Error("Cloudflare Tool: zoneId is required");

      switch (operation) {
        case "upload": {
          const certificate = String(resolveParam(ctx, "certificate", itemJson) ?? "");
          const privateKey = String(resolveParam(ctx, "privateKey", itemJson) ?? "");
          if (!certificate) throw new Error("Cloudflare Tool: certificate is required");
          if (!privateKey) throw new Error("Cloudflare Tool: privateKey is required");
          result = await requestOk("POST", `/zones/${encodeURIComponent(zoneId)}/origin_tls_client_auth`, headers, { certificate, private_key: privateKey });
          break;
        }
        case "get": {
          const certificateId = String(resolveParam(ctx, "certificateId", itemJson) ?? "");
          if (!certificateId) throw new Error("Cloudflare Tool: certificateId is required");
          result = await requestOk("GET", `/zones/${encodeURIComponent(zoneId)}/origin_tls_client_auth/${encodeURIComponent(certificateId)}`, headers);
          break;
        }
        case "getMany": {
          const returnAll = Boolean(node.parameters.returnAll ?? false);
          const limit = Number(node.parameters.limit ?? 25);
          const filters = node.parameters.filters as Record<string, unknown> | undefined;
          const params = new URLSearchParams();
          if (!returnAll) params.set("per_page", String(Math.min(Math.max(limit, 1), 50)));
          if (filters?.status) params.set("status", String(filters.status));
          const qs = params.toString();
          result = await requestOk("GET", `/zones/${encodeURIComponent(zoneId)}/origin_tls_client_auth${qs ? `?${qs}` : ""}`, headers);
          break;
        }
        case "delete": {
          const certificateId = String(resolveParam(ctx, "certificateId", itemJson) ?? "");
          if (!certificateId) throw new Error("Cloudflare Tool: certificateId is required");
          await requestOk("DELETE", `/zones/${encodeURIComponent(zoneId)}/origin_tls_client_auth/${encodeURIComponent(certificateId)}`, headers);
          result = { success: true, result: null };
          break;
        }
        default:
          throw new Error(`Cloudflare Tool: unsupported operation "${operation}"`);
      }

      out.push({ json: result, pairedItem });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem,
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

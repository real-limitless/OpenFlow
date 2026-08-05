import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";

const API_BASE = "https://driftapi.com";

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

async function apiRequest(
  method: string,
  path: string,
  accessToken: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined && method !== "GET" && method !== "DELETE") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "unknown");
    throw new Error(`Drift API error: ${res.status} ${res.statusText} — ${errorBody}`);
  }
  if (res.status === 204) {
    return {};
  }
  return res.json().catch(() => ({}));
}

async function getAccessToken(ctx: ExecutionContext): Promise<string> {
  const driftApi = await ctx.getCredential("driftApi");
  if (driftApi) {
    const data = driftApi as Record<string, unknown>;
    const token = String(data.accessToken ?? data.apiKey ?? "");
    if (token) return token;
  }
  const driftOAuth2 = await ctx.getCredential("driftOAuth2Api");
  if (driftOAuth2) {
    const data = driftOAuth2 as Record<string, unknown>;
    const token = String(data.accessToken ?? "");
    if (token) return token;
  }
  throw new Error("Drift: No valid credential found. Configure driftApi or driftOAuth2Api.");
}

export const driftExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const outputs: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    try {
      const item = items[idx];
      const itemJson = item.json ?? {};
      const operation = String(ctx.getParam("operation") ?? "create");
      const accessToken = await getAccessToken(ctx);

      if (operation === "create") {
        const email = String(resolveValue(ctx.getParam("email"), itemJson) ?? "");
        if (!email) {
          throw new Error("Drift: required parameter 'email' is missing for create");
        }
        const body: Record<string, unknown> = { attributes: { email } };
        const additionalFields = resolveValue(ctx.getParam("additionalFields"), itemJson);
        if (additionalFields && typeof additionalFields === "object") {
          const attrs = body.attributes as Record<string, unknown>;
          for (const [k, v] of Object.entries(additionalFields as Record<string, unknown>)) {
            if (k === "customAttributes" && v && typeof v === "object") {
              const custom = v as Record<string, unknown>;
              for (const [ck, cv] of Object.entries(custom)) {
                attrs[ck] = cv;
              }
            } else {
              attrs[k] = v;
            }
          }
        }
        const result = await apiRequest("POST", "/contacts", accessToken, body);
        const data = (result.data as Record<string, unknown>) ?? result;
        outputs.push({ json: data as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (operation === "get") {
        const contactId = String(resolveValue(ctx.getParam("contactId"), itemJson) ?? "");
        if (!contactId) {
          throw new Error("Drift: required parameter 'contactId' is missing for get");
        }
        const result = await apiRequest("GET", `/contacts/${encodeURIComponent(contactId)}`, accessToken);
        const data = (result.data as Record<string, unknown>) ?? result;
        outputs.push({ json: data as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (operation === "update") {
        const contactId = String(resolveValue(ctx.getParam("contactId"), itemJson) ?? "");
        if (!contactId) {
          throw new Error("Drift: required parameter 'contactId' is missing for update");
        }
        const body: Record<string, unknown> = {};
        const additionalFields = resolveValue(ctx.getParam("additionalFields"), itemJson);
        const attrs: Record<string, unknown> = {};
        if (additionalFields && typeof additionalFields === "object") {
          for (const [k, v] of Object.entries(additionalFields as Record<string, unknown>)) {
            if (k === "customAttributes" && v && typeof v === "object") {
              const custom = v as Record<string, unknown>;
              for (const [ck, cv] of Object.entries(custom)) {
                attrs[ck] = cv;
              }
            } else {
              attrs[k] = v;
            }
          }
        }
        if (Object.keys(attrs).length > 0) {
          body.attributes = attrs;
        }
        const result = await apiRequest("PATCH", `/contacts/${encodeURIComponent(contactId)}`, accessToken, body);
        const data = (result.data as Record<string, unknown>) ?? result;
        outputs.push({ json: data as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (operation === "delete") {
        const contactId = String(resolveValue(ctx.getParam("contactId"), itemJson) ?? "");
        if (!contactId) {
          throw new Error("Drift: required parameter 'contactId' is missing for delete");
        }
        await apiRequest("DELETE", `/contacts/${encodeURIComponent(contactId)}`, accessToken);
        outputs.push({ json: { id: contactId } as Record<string, unknown>, pairedItem: { item: idx } });
      } else if (operation === "getAll") {
        const result = await apiRequest("GET", "/contacts", accessToken);
        const simplify = resolveValue(ctx.getParam("simplify"), itemJson);
        if (simplify === true || simplify === "true") {
          const data = Array.isArray(result.data) ? result.data : [];
          outputs.push({ json: { data } as Record<string, unknown>, pairedItem: { item: idx } });
        } else {
          outputs.push({ json: result as Record<string, unknown>, pairedItem: { item: idx } });
        }
      } else {
        outputs.push({
          json: { error: `Drift: unsupported operation: ${operation}` },
          pairedItem: { item: idx },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (ctx.continueOnFail()) {
        outputs.push({ json: { error: { message, code: err instanceof Error ? (err as any).code ?? "UNKNOWN" : "UNKNOWN" } } as Record<string, unknown>, pairedItem: { item: idx } });
      } else {
        throw err;
      }
    }
  }

  if (outputs.length === 0) {
    return [[{ json: {} }]];
  }
  return [outputs];
};

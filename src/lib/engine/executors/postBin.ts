import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const POSTBIN_BASE = "https://www.postb.in";

function extractBinId(raw: string): string {
  const validPattern = /\b\d{13}-\d{13}\b/;
  if (validPattern.test(raw)) return raw;
  const urlMatch = raw.match(/postb\.in\/(?:b\/)?([^/?#]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9_-]{6,16}$/.test(raw)) return raw;
  throw new Error("Bin ID format is not valid");
}

export const postBinExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "bin");
  const operation = ctx.getParam<string>("operation", "create");
  const continueOnFail = ctx.continueOnFail();

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      if (resource === "bin") {
        if (operation === "create") {
          const res = await fetch(`${POSTBIN_BASE}/api/bin`, { method: "POST" });
          if (!res.ok) {
            const errorBody = await res.text().catch(() => "");
            throw new Error(`PostBin API: HTTP ${res.status}${errorBody ? ` — ${errorBody}` : ""}`);
          }
          const body = (await res.json()) as Record<string, unknown>;
          const binId = String(body.id ?? body.binId ?? "");
          const now = Date.now();
          const expires = now + 30 * 60 * 1000;
          out.push({
            json: {
              binId,
              nowTimestamp: now,
              nowIso: new Date(now).toISOString(),
              expiresTimestamp: expires,
              expiresIso: new Date(expires).toISOString(),
              requestUrl: `${POSTBIN_BASE}/${binId}`,
              viewUrl: `${POSTBIN_BASE}/b/${binId}`,
            },
            pairedItem: { item: i, input: 0 },
          });
        } else if (operation === "get") {
          const rawBinId = ctx.getParam<string>("binId", "");
          const binId = extractBinId(rawBinId);
          if (!binId) {
            throw new Error("Bin ID format is not valid");
          }
          const res = await fetch(`${POSTBIN_BASE}/api/bin/${binId}`);
          if (!res.ok) {
            const errorBody = await res.text().catch(() => "");
            throw new Error(`PostBin API: HTTP ${res.status}${errorBody ? ` — ${errorBody}` : ""}`);
          }
          const body = (await res.json()) as Record<string, unknown>;
          const receivedBinId = String(body.id ?? body.binId ?? binId);
          const created = Number(body.created ?? body.createdAt ?? body.nowTimestamp ?? Date.now());
          out.push({
            json: {
              binId: receivedBinId,
              nowTimestamp: created,
              nowIso: new Date(created).toISOString(),
              expiresTimestamp: Number(body.expires ?? body.expiresAt ?? body.expiresTimestamp ?? (created + 30 * 60 * 1000)),
              expiresIso: new Date(Number(body.expires ?? body.expiresAt ?? body.expiresTimestamp ?? (created + 30 * 60 * 1000))).toISOString(),
              requestUrl: `${POSTBIN_BASE}/${receivedBinId}`,
              viewUrl: `${POSTBIN_BASE}/b/${receivedBinId}`,
            },
            pairedItem: { item: i, input: 0 },
          });
        } else if (operation === "delete") {
          const rawBinId = ctx.getParam<string>("binId", "");
          const binId = extractBinId(rawBinId);
          if (!binId) {
            throw new Error("Bin ID format is not valid");
          }
          const res = await fetch(`${POSTBIN_BASE}/api/bin/${binId}`, { method: "DELETE" });
          if (!res.ok) {
            const errorBody = await res.text().catch(() => "");
            throw new Error(`PostBin API: HTTP ${res.status}${errorBody ? ` — ${errorBody}` : ""}`);
          }
          out.push(item);
        }
      } else if (resource === "request") {
        const rawBinId = ctx.getParam<string>("binId", "");
        const binId = extractBinId(rawBinId);
        if (!binId) {
          throw new Error("Bin ID format is not valid");
        }

        if (operation === "get") {
          const requestId = ctx.getParam<string>("requestId", "");
          if (!requestId) {
            throw new Error("requestId is required for request/get operation");
          }
          const res = await fetch(`${POSTBIN_BASE}/api/bin/${binId}/req/${requestId}`);
          if (!res.ok) {
            const errorBody = await res.text().catch(() => "");
            throw new Error(`PostBin API: HTTP ${res.status}${errorBody ? ` — ${errorBody}` : ""}`);
          }
          const body = (await res.json()) as Record<string, unknown>;
          out.push({
            json: body,
            pairedItem: { item: i, input: 0 },
          });
        } else if (operation === "removeFirst") {
          const res = await fetch(`${POSTBIN_BASE}/api/bin/${binId}/req/shift`);
          if (!res.ok) {
            const errorBody = await res.text().catch(() => "");
            throw new Error(`PostBin API: HTTP ${res.status}${errorBody ? ` — ${errorBody}` : ""}`);
          }
          const body = (await res.json()) as Record<string, unknown>;
          out.push({
            json: body,
            pairedItem: { item: i, input: 0 },
          });
        } else if (operation === "send") {
          const binContent = ctx.getParam<string>("binContent", "");
          const bodyPayload = binContent || (item.json && typeof item.json === "object" ? JSON.stringify(item.json) : "");
          const headers: Record<string, string> = { "Content-Type": "text/plain" };
          try {
            JSON.parse(bodyPayload);
            headers["Content-Type"] = "application/json";
          } catch {}
          const res = await fetch(`${POSTBIN_BASE}/${binId}`, {
            method: "POST",
            headers,
            body: bodyPayload,
          });
          if (!res.ok) {
            const errorBody = await res.text().catch(() => "");
            throw new Error(`PostBin API: HTTP ${res.status}${errorBody ? ` — ${errorBody}` : ""}`);
          }
          const body = (await res.json()) as Record<string, unknown>;
          out.push({
            json: { requestId: String(body.id ?? body.requestId ?? "") },
            pairedItem: { item: i, input: 0 },
          });
        }
      }
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

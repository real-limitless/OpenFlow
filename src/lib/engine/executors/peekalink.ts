import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const PEEKALINK_PREVIEW_URL = "https://api.peekalink.io/v2/preview";
const PEEKALINK_CHECK_URL = "https://api.peekalink.io/v2/is-available";

export const peekalinkExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const operation = ctx.getParam<string>("operation", "preview");
  const continueOnFail = ctx.continueOnFail();

  const credential = await ctx.getCredential("peekalinkApi");
  const apiKey =
    credential && typeof credential === "object" && "apiKey" in credential
      ? (credential as Record<string, string>).apiKey
      : null;

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const rawUrl = ctx.getParam<string>("url", "");
      if (!rawUrl || rawUrl.trim() === "") {
        throw new Error("Peekalink: URL is required");
      }

      const resolvedUrl = await ctx.evaluate(rawUrl, item.json);
      const url = typeof resolvedUrl === "string" ? resolvedUrl : rawUrl;

      if (!url || url.trim() === "") {
        throw new Error("Peekalink: URL is required");
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (apiKey) {
        headers["X-API-Key"] = apiKey;
      }

      const endpoint =
        operation === "check" ? PEEKALINK_CHECK_URL : PEEKALINK_PREVIEW_URL;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new Error(
          `Peekalink API: HTTP ${res.status}${errorBody ? ` — ${errorBody}` : ""}`,
        );
      }

      const body = (await res.json()) as Record<string, unknown>;

      if (operation === "check") {
        const available =
          body.available === true || body.isAvailable === true;
        out.push({
          json: { ...(item.json as Record<string, unknown>), available },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
      } else {
        out.push({
          json: { ...(item.json as Record<string, unknown>), ...body },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
      }
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

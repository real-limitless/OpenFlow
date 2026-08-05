import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const API_BASE = "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";

export const googlePageSpeedInsightsExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const continueOnFail = ctx.continueOnFail();
  const credential = await ctx.getCredential("googleApi");

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const url = ctx.getParam<string>("url", "");
      if (!url || url.trim() === "") {
        throw new Error("Google PageSpeed Insights: 'url' parameter is required");
      }

      const strategy = ctx.getParam<string>("strategy", "DESKTOP");
      const categories = ctx.getParam<string[]>("categories", ["PERFORMANCE"]);
      const locale = ctx.getParam<string>("locale", "");

      const queryParams = new URLSearchParams();
      queryParams.set("url", url);
      queryParams.set("strategy", strategy);

      for (const cat of categories) {
        if (cat) {
          queryParams.append("category", cat);
        }
      }

      if (locale) {
        queryParams.set("locale", locale);
      }

      if (credential && typeof credential === "object" && "apiKey" in credential) {
        queryParams.set("key", String(credential.apiKey));
      }

      const requestUrl = `${API_BASE}?${queryParams.toString()}`;
      const response = await fetch(requestUrl, {
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(
          `Google PageSpeed Insights API: HTTP ${response.status} ${response.statusText ?? ""}`.trim(),
        );
      }

      const result = (await response.json()) as Record<string, unknown>;

      out.push({
        json: result,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
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

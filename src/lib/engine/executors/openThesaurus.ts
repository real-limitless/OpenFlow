import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const API_BASE = "https://www.openthesaurus.de/synonyme/search";

export const openThesaurusExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const text = ctx.getParam<string>("text", "");
  const options = ctx.getParam<Record<string, unknown>>("options", {});
  const continueOnFail = ctx.continueOnFail();

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const query = text.trim();
      if (query === "") {
        if (continueOnFail) {
          out.push({
            json: { ...(item.json as Record<string, unknown>) },
            pairedItem: item.pairedItem ?? { item: i, input: 0 },
          });
          continue;
        }
        throw new Error("OpenThesaurus: text parameter is required");
      }

      const params = new URLSearchParams({ q: query, format: "application/json" });
      if (options.similar) params.set("similar", "true");
      if (options.substring) params.set("substring", "true");
      if (options.baseform) params.set("baseform", "true");

      const url = `${API_BASE}?${params.toString()}`;
      const res = await fetch(url, { headers: { accept: "application/json" } });

      if (!res.ok) {
        throw new Error(`OpenThesaurus API: HTTP ${res.status}`);
      }

      const body = (await res.json()) as Record<string, unknown>;
      const outputJson: Record<string, unknown> = {
        ...(item.json as Record<string, unknown>),
        openThesaurus: body,
      };

      out.push({
        json: outputJson,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { ...(item.json as Record<string, unknown>), error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

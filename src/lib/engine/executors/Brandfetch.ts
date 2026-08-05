import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const BRANDFETCH_BASE = "https://api.brandfetch.io";

export const brandfetchExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const operation = ctx.getParam<string>("operation", "logo");
  const continueOnFail = ctx.continueOnFail();
  const credential = await ctx.getCredential("brandfetchApi");
  const apiKey =
    credential && typeof credential === "object" && "apiKey" in credential
      ? (credential as Record<string, string>).apiKey
      : undefined;

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const domain = ctx.getParam<string>("domain", "");
      if (!domain || domain.trim() === "") {
        throw new Error("Brandfetch: domain is required");
      }

      if (operation === "logo") {
        const result = await fetchBrandData(domain, apiKey, continueOnFail);
        const download = ctx.getParam<boolean>("download", false);

        const output: Record<string, unknown> = {};
        if (result?.logos) {
          const logos = (result.logos as Array<{
            type: string;
            formats?: Array<{ src: string; format: string }>;
          }>) ?? [];
          for (const entry of logos) {
            output[entry.type] = (entry.formats ?? []).map((f) => ({
              src: f.src,
              format: f.format,
            }));
          }
        }

        const outputItem: INodeExecutionData = {
          json: { ...output },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        };

        if (download && result?.logos) {
          const imageTypes = ctx.getParam<string[]>("imageTypes", ["logo", "icon"]);
          const imageFormats = ctx.getParam<string[]>("imageFormats", ["png"]);

          const binary: Record<string, { data: string; mimeType: string }> = {};

          for (const entry of (result.logos as Array<{
            type: string;
            formats?: Array<{ src: string; format: string }>;
          }>)) {
            if (!imageTypes.includes(entry.type)) continue;
            for (const fmt of (entry.formats ?? [])) {
              if (!imageFormats.includes(fmt.format)) continue;
              const binaryKey = `${entry.type}_${fmt.format}`;
              const resp = await fetch(fmt.src);
              if (!resp.ok) continue;
              const buf = Buffer.from(await resp.arrayBuffer());
              const mimeType =
                fmt.format === "svg" ? "image/svg+xml" : `image/${fmt.format}`;
              binary[binaryKey] = {
                data: buf.toString("base64"),
                mimeType,
              };
            }
          }

          if (Object.keys(binary).length > 0) {
            outputItem.binary = binary;
          }
        }

        out.push(outputItem);
      } else {
        const result = await fetchBrandData(domain, apiKey, continueOnFail);
        if (!result) {
          throw new Error("Brandfetch: no data returned");
        }

        let projectedJson: Record<string, unknown>;
        switch (operation) {
          case "company":
            projectedJson = result as Record<string, unknown>;
            break;
          case "color":
            projectedJson = { colors: (result as Record<string, unknown>).colors };
            break;
          case "font":
            projectedJson = { fonts: (result as Record<string, unknown>).fonts };
            break;
          case "industry": {
            const company = (result as Record<string, unknown>).company as
              | Record<string, unknown>
              | undefined;
            const industries = company?.industries as Array<{ name: string }> | undefined;
            projectedJson = {
              industry:
                industries?.[0]?.name ?? company?.industries ?? null,
            };
            break;
          }
          default:
            projectedJson = result as Record<string, unknown>;
        }

        out.push({
          json: projectedJson,
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

async function fetchBrandData(
  domain: string,
  apiKey: string | undefined,
  _continueOnFail: boolean,
): Promise<unknown> {
  const url = `${BRANDFETCH_BASE}/v2/brands/${encodeURIComponent(domain)}`;
  const headers: Record<string, string> = {
    accept: "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(
      `Brandfetch API: HTTP ${res.status} ${res.statusText ?? ""}`.trim(),
    );
  }
  return res.json();
}

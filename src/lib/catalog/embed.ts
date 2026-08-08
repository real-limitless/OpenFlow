import { config } from "@/config";
import { hashEmbed, l2Normalize, padOrTrim } from "./hash";

export type EmbedMode = "api" | "hash";

export interface EmbedClient {
  modelId: string;
  dimensions: number;
  mode: EmbedMode;
  embed(texts: string[]): Promise<number[][]>;
}

function resolveDims(): number {
  return config.catalog.dimensions;
}

export function createEmbedClient(forceHash = false): EmbedClient {
  const dimensions = resolveDims();
  const apiKey = config.catalog.embedApiKey;
  const baseUrl = config.catalog.embedBaseUrl.replace(/\/$/, "");
  const model = config.catalog.embedModel;

  if (forceHash || !apiKey) {
    return {
      modelId: `hash/${dimensions}`,
      dimensions,
      mode: "hash",
      async embed(texts: string[]) {
        return texts.map((t) => hashEmbed(t, dimensions));
      },
    };
  }

  return {
    modelId: model,
    dimensions,
    mode: "api",
    async embed(texts: string[]) {
      if (texts.length === 0) return [];
      const url = `${baseUrl}/embeddings`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: texts.length === 1 ? texts[0] : texts,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Catalog embed API ${res.status}: ${errText.slice(0, 300)}`);
      }
      const json = (await res.json()) as {
        data?: Array<{ embedding?: number[]; index?: number }>;
      };
      const data = Array.isArray(json.data) ? json.data : [];
      const byIndex = new Map<number, number[]>();
      for (const row of data) {
        if (row && Array.isArray(row.embedding)) {
          byIndex.set(row.index ?? byIndex.size, padOrTrim(row.embedding, dimensions));
        }
      }
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i++) {
        const v = byIndex.get(i);
        if (!v) throw new Error(`Catalog embed missing vector for index ${i}`);
        out.push(l2Normalize(v));
      }
      return out;
    },
  };
}

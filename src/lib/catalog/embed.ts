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

function normalizeBaseUrl(raw: string): string {
  let u = raw.replace(/\/$/, "");
  // TEI often served at host root; OpenAI path is /v1/embeddings
  return u;
}

/**
 * Create embed client.
 * - forceHash → offline feature-hash
 * - else remote OpenAI-compatible POST {base}/embeddings when key present OR no-auth allowed
 * - else hash fallback
 */
export function createEmbedClient(forceHash = false): EmbedClient {
  const dimensions = resolveDims();
  const apiKey = config.catalog.embedApiKey;
  const baseUrl = normalizeBaseUrl(config.catalog.embedBaseUrl);
  const model = config.catalog.embedModel;
  const allowNoAuth = config.catalog.embedAllowNoAuth;
  const useApi = !forceHash && (Boolean(apiKey) || allowNoAuth);

  if (!useApi) {
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
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (apiKey) {
        headers.authorization = `Bearer ${apiKey}`;
      }
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          input: texts.length === 1 ? texts[0] : texts,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          `Catalog embed API ${res.status} ${url}: ${errText.slice(0, 400)}`,
        );
      }
      const json = (await res.json()) as {
        data?: Array<{ embedding?: number[]; index?: number }>;
        // TEI alternate shape sometimes returns embedding arrays directly
        embeddings?: number[][];
      };

      if (Array.isArray(json.embeddings) && json.embeddings.length > 0) {
        return json.embeddings.map((e) => l2Normalize(padOrTrim(e, dimensions)));
      }

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

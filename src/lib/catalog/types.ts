export type CatalogChunkKind = "summary" | "operations" | "spec";

export type CatalogRankTier = "domain" | "core" | "ai" | "shell-fallback";

export interface CatalogCorpusChunk {
  id: string;
  typeName: string;
  chunkKind: CatalogChunkKind;
  title: string;
  body: string;
  contentHash: string;
  isShell: boolean;
  rankBoost: number;
  category: string;
  displayName: string;
  metadata: Record<string, unknown>;
}

export interface SuggestNodesOptions {
  intent: string;
  limit?: number;
  /** When true, still return shell nodes but with penalty (default). */
  includeShell?: boolean;
}

export interface SuggestedNode {
  type: string;
  displayName: string;
  description: string;
  category: string;
  score: number;
  rankTier: CatalogRankTier;
  reason: string;
  isShell: boolean;
  inputs?: string | string[];
  outputs?: string | string[];
}

export interface SuggestNodesResult {
  mode: "semantic" | "keyword" | "hybrid" | "empty";
  count: number;
  items: SuggestedNode[];
  indexed: boolean;
  modelId?: string;
  note?: string;
}

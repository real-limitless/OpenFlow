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
  /** Caller surface for metrics: palette | mcp | agent | api */
  source?: string;
  /** Skip metrics bump (tests). */
  skipMetrics?: boolean;
}

export interface SuggestedNode {
  type: string;
  displayName: string;
  description: string;
  category: string;
  score: number;
  rankTier: CatalogRankTier;
  /** Why this matched (hybrid / keyword / anchor). */
  reason: string;
  isShell: boolean;
  /** Lucide icon name for palette. */
  icon?: string;
  /** Spec/ops-backed usage line (operations list or description). */
  usageSnippet?: string;
  /** Short guidance: when to pick this node (shell penalty callout). */
  whenToUse?: string;
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

import { prisma } from "@/server/db";
import { config } from "@/config";
import type { CatalogCorpusChunk } from "./types";
import { cosineSimilarity } from "./hash";
import type { EmbedClient } from "./embed";

export interface StoredChunk extends CatalogCorpusChunk {
  embedding: number[];
  modelId: string;
  dimensions: number;
}

let memoryIndex: StoredChunk[] | null = null;
let memoryModelId: string | null = null;

export function clearMemoryIndex(): void {
  memoryIndex = null;
  memoryModelId = null;
}

export function getMemoryIndex(): StoredChunk[] | null {
  return memoryIndex;
}

function vectorLiteral(vec: number[]): string {
  return `[${vec.map((x) => (Number.isFinite(x) ? x : 0)).join(",")}]`;
}

export async function upsertChunks(
  chunks: CatalogCorpusChunk[],
  embeddings: number[][],
  client: EmbedClient,
): Promise<number> {
  if (chunks.length !== embeddings.length) {
    throw new Error("upsertChunks: chunks/embeddings length mismatch");
  }
  const now = new Date();
  let n = 0;
  const usePg = config.catalog.usePgvector;

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    const emb = embeddings[i]!;
    const embJson = JSON.stringify(emb);
    const meta = JSON.stringify(c.metadata ?? {});

    await prisma.nodeCatalogChunk.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        typeName: c.typeName,
        chunkKind: c.chunkKind,
        title: c.title,
        body: c.body,
        contentHash: c.contentHash,
        modelId: client.modelId,
        dimensions: client.dimensions,
        embeddingJson: embJson,
        isShell: c.isShell,
        rankBoost: c.rankBoost,
        category: c.category,
        displayName: c.displayName,
        metadata: meta,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        typeName: c.typeName,
        chunkKind: c.chunkKind,
        title: c.title,
        body: c.body,
        contentHash: c.contentHash,
        modelId: client.modelId,
        dimensions: client.dimensions,
        embeddingJson: embJson,
        isShell: c.isShell,
        rankBoost: c.rankBoost,
        category: c.category,
        displayName: c.displayName,
        metadata: meta,
        updatedAt: now,
      },
    });

    if (usePg && emb.length === 1536) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "node_catalog_chunks" SET "embedding" = $1::vector WHERE "id" = $2`,
          vectorLiteral(emb),
          c.id,
        );
      } catch {
        // extension / dim mismatch — JSON path still works
      }
    }
    n++;
  }

  await prisma.nodeCatalogMeta.upsert({
    where: { key: "last_reindex_at" },
    create: { key: "last_reindex_at", value: now.toISOString(), updatedAt: now },
    update: { value: now.toISOString(), updatedAt: now },
  });
  await prisma.nodeCatalogMeta.upsert({
    where: { key: "model_id" },
    create: { key: "model_id", value: client.modelId, updatedAt: now },
    update: { value: client.modelId, updatedAt: now },
  });
  await prisma.nodeCatalogMeta.upsert({
    where: { key: "chunk_count" },
    create: { key: "chunk_count", value: String(n), updatedAt: now },
    update: { value: String(n), updatedAt: now },
  });

  clearMemoryIndex();
  return n;
}

export async function loadIndexFromDb(): Promise<StoredChunk[]> {
  if (memoryIndex && memoryIndex.length > 0) return memoryIndex;

  const rows = await prisma.nodeCatalogChunk.findMany({
    select: {
      id: true,
      typeName: true,
      chunkKind: true,
      title: true,
      body: true,
      contentHash: true,
      modelId: true,
      dimensions: true,
      embeddingJson: true,
      isShell: true,
      rankBoost: true,
      category: true,
      displayName: true,
      metadata: true,
    },
  });

  const out: StoredChunk[] = [];
  for (const r of rows) {
    let embedding: number[] = [];
    if (r.embeddingJson) {
      try {
        const parsed = JSON.parse(r.embeddingJson) as unknown;
        if (Array.isArray(parsed)) embedding = parsed.map((x) => Number(x) || 0);
      } catch {
        embedding = [];
      }
    }
    if (embedding.length === 0) continue;
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(r.metadata || "{}") as Record<string, unknown>;
    } catch {
      metadata = {};
    }
    out.push({
      id: r.id,
      typeName: r.typeName,
      chunkKind: r.chunkKind as StoredChunk["chunkKind"],
      title: r.title,
      body: r.body,
      contentHash: r.contentHash,
      isShell: r.isShell,
      rankBoost: r.rankBoost,
      category: r.category ?? "",
      displayName: r.displayName ?? r.typeName,
      metadata,
      embedding,
      modelId: r.modelId,
      dimensions: r.dimensions,
    });
  }

  memoryIndex = out;
  memoryModelId = out[0]?.modelId ?? null;
  return out;
}

export async function catalogStats(): Promise<{
  chunkCount: number;
  modelId: string | null;
  lastReindexAt: string | null;
}> {
  const [count, model, last] = await Promise.all([
    prisma.nodeCatalogChunk.count(),
    prisma.nodeCatalogMeta.findUnique({ where: { key: "model_id" } }),
    prisma.nodeCatalogMeta.findUnique({ where: { key: "last_reindex_at" } }),
  ]);
  return {
    chunkCount: count,
    modelId: model?.value ?? memoryModelId,
    lastReindexAt: last?.value ?? null,
  };
}

export function searchMemory(
  queryVec: number[],
  chunks: StoredChunk[],
  topK: number,
): Array<{ chunk: StoredChunk; score: number }> {
  const scored = chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryVec, chunk.embedding) + (chunk.rankBoost || 0) * 0.05,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/** Optional ANN via pgvector when embeddings are 1536-d and extension works. */
export async function searchPgvector(
  queryVec: number[],
  topK: number,
): Promise<Array<{ id: string; typeName: string; score: number }> | null> {
  if (!config.catalog.usePgvector || queryVec.length !== 1536) return null;
  try {
    const lit = vectorLiteral(queryVec);
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; typeName: string; dist: number }>
    >(
      `SELECT "id", "typeName", ("embedding" <=> $1::vector) AS dist
       FROM "node_catalog_chunks"
       WHERE "embedding" IS NOT NULL
       ORDER BY "embedding" <=> $1::vector
       LIMIT $2`,
      lit,
      topK,
    );
    return rows.map((r) => ({
      id: r.id,
      typeName: r.typeName,
      score: 1 - Number(r.dist),
    }));
  } catch {
    return null;
  }
}

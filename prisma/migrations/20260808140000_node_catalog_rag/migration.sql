-- Semantic node catalog (RAG). JSON embeddings always; pgvector optional when extension exists.

CREATE TABLE IF NOT EXISTS "node_catalog_chunks" (
    "id" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "chunkKind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "embeddingJson" TEXT,
    "isShell" BOOLEAN NOT NULL DEFAULT false,
    "rankBoost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "category" TEXT,
    "displayName" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "node_catalog_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "node_catalog_chunks_typeName_idx" ON "node_catalog_chunks"("typeName");
CREATE INDEX IF NOT EXISTS "node_catalog_chunks_chunkKind_idx" ON "node_catalog_chunks"("chunkKind");
CREATE INDEX IF NOT EXISTS "node_catalog_chunks_isShell_idx" ON "node_catalog_chunks"("isShell");
CREATE INDEX IF NOT EXISTS "node_catalog_chunks_contentHash_idx" ON "node_catalog_chunks"("contentHash");

CREATE TABLE IF NOT EXISTS "node_catalog_meta" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "node_catalog_meta_pkey" PRIMARY KEY ("key")
);

-- Optional pgvector (no-op when extension is not installed on the server).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE "node_catalog_chunks" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
  BEGIN
    CREATE INDEX IF NOT EXISTS "node_catalog_chunks_embedding_hnsw"
      ON "node_catalog_chunks"
      USING hnsw ("embedding" vector_cosine_ops);
  EXCEPTION WHEN OTHERS THEN
    -- hnsw may be unavailable; ignore
    NULL;
  END;
EXCEPTION WHEN OTHERS THEN
  -- vector extension missing: JSON path remains fully functional
  NULL;
END $$;

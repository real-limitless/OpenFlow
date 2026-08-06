-- Multi-source template libraries: sourceId/packId composite ids

-- Drop old unique on externalId (will be recreated as non-unique index)
DROP INDEX IF EXISTS "workflow_templates_externalId_key";

-- Add new columns with temporary defaults for existing rows
ALTER TABLE "workflow_templates" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
ALTER TABLE "workflow_templates" ADD COLUMN IF NOT EXISTS "sourceName" TEXT;
ALTER TABLE "workflow_templates" ADD COLUMN IF NOT EXISTS "packId" TEXT;
ALTER TABLE "workflow_templates" ADD COLUMN IF NOT EXISTS "libraryUrl" TEXT;

-- Backfill from legacy bare n8n ids
UPDATE "workflow_templates"
SET
  "sourceId" = COALESCE(NULLIF("sourceId", ''), 'n8n-community'),
  "sourceName" = COALESCE("sourceName", 'n8n Community Library'),
  "packId" = COALESCE(NULLIF("packId", ''), "id"),
  "libraryUrl" = COALESCE(
    "libraryUrl",
    'https://github.com/real-limitless/n8n-workflow-library'
  );

-- Rewrite primary keys to sourceId:packId (only when still bare)
UPDATE "workflow_templates"
SET "id" = "sourceId" || ':' || "packId"
WHERE "id" NOT LIKE '%:%';

ALTER TABLE "workflow_templates" ALTER COLUMN "sourceId" SET NOT NULL;
ALTER TABLE "workflow_templates" ALTER COLUMN "packId" SET NOT NULL;

-- externalId may be null for non-numeric pack ids
ALTER TABLE "workflow_templates" ALTER COLUMN "externalId" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_templates_sourceId_packId_key"
  ON "workflow_templates"("sourceId", "packId");

CREATE INDEX IF NOT EXISTS "workflow_templates_sourceId_idx"
  ON "workflow_templates"("sourceId");

CREATE INDEX IF NOT EXISTS "workflow_templates_externalId_idx"
  ON "workflow_templates"("externalId");

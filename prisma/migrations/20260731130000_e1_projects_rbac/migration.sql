-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'team',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one personal project per existing user
INSERT INTO "projects" ("id", "name", "type", "createdAt", "updatedAt")
SELECT
  'proj_personal_' || u."id",
  CASE WHEN u."email" LIKE '%@local' THEN 'Personal' ELSE split_part(u."email", '@', 1) || '''s project' END,
  'personal',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "project_members" pm WHERE pm."userId" = u."id"
);

INSERT INTO "project_members" ("id", "projectId", "userId", "role", "createdAt")
SELECT
  'pm_' || u."id",
  'proj_personal_' || u."id",
  u."id",
  'owner',
  CURRENT_TIMESTAMP
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "project_members" pm WHERE pm."userId" = u."id"
);

-- Add nullable projectId columns
ALTER TABLE "workflows" ADD COLUMN "projectId" TEXT;
ALTER TABLE "credentials" ADD COLUMN "projectId" TEXT;
ALTER TABLE "data_tables" ADD COLUMN "projectId" TEXT;

-- Attach existing rows to owner's personal project
UPDATE "workflows" w
SET "projectId" = 'proj_personal_' || w."userId"
WHERE w."projectId" IS NULL;

UPDATE "credentials" c
SET "projectId" = 'proj_personal_' || c."userId"
WHERE c."projectId" IS NULL;

UPDATE "data_tables" d
SET "projectId" = 'proj_personal_' || d."userId"
WHERE d."projectId" IS NULL;

-- Orphan safety: any remaining nulls get a catch-all project
INSERT INTO "projects" ("id", "name", "type", "createdAt", "updatedAt")
SELECT 'proj_orphan', 'Orphaned', 'team', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM "workflows" WHERE "projectId" IS NULL
  UNION ALL SELECT 1 FROM "credentials" WHERE "projectId" IS NULL
  UNION ALL SELECT 1 FROM "data_tables" WHERE "projectId" IS NULL
);

UPDATE "workflows" SET "projectId" = 'proj_orphan' WHERE "projectId" IS NULL;
UPDATE "credentials" SET "projectId" = 'proj_orphan' WHERE "projectId" IS NULL;
UPDATE "data_tables" SET "projectId" = 'proj_orphan' WHERE "projectId" IS NULL;

-- Make required
ALTER TABLE "workflows" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "credentials" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "data_tables" ALTER COLUMN "projectId" SET NOT NULL;

-- FKs + indexes
CREATE INDEX "workflows_projectId_idx" ON "workflows"("projectId");
CREATE INDEX "credentials_projectId_idx" ON "credentials"("projectId");
CREATE INDEX "data_tables_projectId_idx" ON "data_tables"("projectId");

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_tables" ADD CONSTRAINT "data_tables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- data_tables unique was (userId, name); switch to (projectId, name)
DROP INDEX IF EXISTS "data_tables_userId_name_key";
CREATE UNIQUE INDEX "data_tables_projectId_name_key" ON "data_tables"("projectId", "name");

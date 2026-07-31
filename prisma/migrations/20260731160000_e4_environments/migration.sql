-- CreateTable
CREATE TABLE "environments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "environments_projectId_idx" ON "environments"("projectId");
CREATE INDEX "environments_slug_idx" ON "environments"("slug");
CREATE UNIQUE INDEX "environments_project_slug_uidx" ON "environments"("projectId", "slug") WHERE "projectId" IS NOT NULL;
CREATE UNIQUE INDEX "environments_instance_slug_uidx" ON "environments"("slug") WHERE "projectId" IS NULL;

ALTER TABLE "environments" ADD CONSTRAINT "environments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default envs for every existing project
INSERT INTO "environments" ("id", "projectId", "name", "slug", "isDefault", "sortOrder", "createdAt", "updatedAt")
SELECT 'env_dev_' || p."id", p."id", 'Development', 'development', false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p;

INSERT INTO "environments" ("id", "projectId", "name", "slug", "isDefault", "sortOrder", "createdAt", "updatedAt")
SELECT 'env_stg_' || p."id", p."id", 'Staging', 'staging', false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p;

INSERT INTO "environments" ("id", "projectId", "name", "slug", "isDefault", "sortOrder", "createdAt", "updatedAt")
SELECT 'env_prd_' || p."id", p."id", 'Production', 'production', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p;

-- Variable.environmentId (nullable = base for all envs)
ALTER TABLE "variables" ADD COLUMN "environmentId" TEXT;
CREATE INDEX "variables_environmentId_idx" ON "variables"("environmentId");
ALTER TABLE "variables" ADD CONSTRAINT "variables_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old unique indexes; recreate with environment awareness
DROP INDEX IF EXISTS "variables_instance_key_uidx";
DROP INDEX IF EXISTS "variables_project_key_uidx";

CREATE UNIQUE INDEX "variables_instance_base_key_uidx"
  ON "variables" ("key") WHERE "scope" = 'instance' AND "environmentId" IS NULL;
CREATE UNIQUE INDEX "variables_instance_env_key_uidx"
  ON "variables" ("environmentId", "key") WHERE "scope" = 'instance' AND "environmentId" IS NOT NULL;
CREATE UNIQUE INDEX "variables_project_base_key_uidx"
  ON "variables" ("projectId", "key") WHERE "scope" = 'project' AND "environmentId" IS NULL;
CREATE UNIQUE INDEX "variables_project_env_key_uidx"
  ON "variables" ("projectId", "environmentId", "key") WHERE "scope" = 'project' AND "environmentId" IS NOT NULL;

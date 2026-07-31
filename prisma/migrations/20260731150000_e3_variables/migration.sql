-- CreateTable
CREATE TABLE "variables" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT 'null',
    "scope" TEXT NOT NULL DEFAULT 'project',
    "projectId" TEXT,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "variables_projectId_idx" ON "variables"("projectId");

-- CreateIndex
CREATE INDEX "variables_scope_idx" ON "variables"("scope");

-- CreateIndex
CREATE INDEX "variables_key_idx" ON "variables"("key");

-- Partial unique: one key per instance; one key per project
CREATE UNIQUE INDEX "variables_instance_key_uidx" ON "variables" ("key") WHERE "scope" = 'instance';
CREATE UNIQUE INDEX "variables_project_key_uidx" ON "variables" ("projectId", "key") WHERE "scope" = 'project';

-- AddForeignKey
ALTER TABLE "variables" ADD CONSTRAINT "variables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

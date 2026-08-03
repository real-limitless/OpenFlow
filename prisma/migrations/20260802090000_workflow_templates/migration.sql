-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" TEXT NOT NULL,
    "externalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "recentViews" INTEGER NOT NULL DEFAULT 0,
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "nodeTypes" TEXT NOT NULL DEFAULT '[]',
    "categories" TEXT NOT NULL DEFAULT '[]',
    "authorName" TEXT,
    "authorUsername" TEXT,
    "authorAvatar" TEXT,
    "workflowJson" TEXT NOT NULL,
    "metaJson" TEXT,
    "sourceUrl" TEXT,
    "readyToDemo" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_externalId_key" ON "workflow_templates"("externalId");

-- CreateIndex
CREATE INDEX "workflow_templates_views_idx" ON "workflow_templates"("views");

-- CreateIndex
CREATE INDEX "workflow_templates_name_idx" ON "workflow_templates"("name");

-- CreateIndex
CREATE INDEX "workflow_templates_syncedAt_idx" ON "workflow_templates"("syncedAt");

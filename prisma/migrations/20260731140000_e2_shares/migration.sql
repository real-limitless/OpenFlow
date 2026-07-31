-- CreateTable
CREATE TABLE "shares" (
    "id" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "granteeUserId" TEXT,
    "granteeProjectId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shares_resourceType_resourceId_idx" ON "shares"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "shares_granteeUserId_idx" ON "shares"("granteeUserId");

-- CreateIndex
CREATE INDEX "shares_granteeProjectId_idx" ON "shares"("granteeProjectId");

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_granteeUserId_fkey" FOREIGN KEY ("granteeUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_granteeProjectId_fkey" FOREIGN KEY ("granteeProjectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

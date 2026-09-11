-- CreateTable
CREATE TABLE "credential_env_overrides" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "dataEncrypted" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_env_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credential_env_overrides_credentialId_environmentId_key" ON "credential_env_overrides"("credentialId", "environmentId");

-- CreateIndex
CREATE INDEX "credential_env_overrides_environmentId_idx" ON "credential_env_overrides"("environmentId");

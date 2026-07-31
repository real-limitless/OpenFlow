-- CreateTable
CREATE TABLE "secret_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "configEncrypted" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secret_providers_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "credentials" ADD COLUMN "secretProviderId" TEXT;
ALTER TABLE "credentials" ADD COLUMN "externalRef" TEXT;
ALTER TABLE "credentials" ALTER COLUMN "dataEncrypted" SET DEFAULT '';

-- CreateIndex
CREATE INDEX "credentials_secretProviderId_idx" ON "credentials"("secretProviderId");

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_secretProviderId_fkey" FOREIGN KEY ("secretProviderId") REFERENCES "secret_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

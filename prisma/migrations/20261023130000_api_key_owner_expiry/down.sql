-- Reverse of 20261023130000_api_key_owner_expiry.
ALTER TABLE "api_keys" ALTER COLUMN "expiresAt" DROP NOT NULL;
ALTER TABLE "api_keys" ALTER COLUMN "expiresAt" DROP DEFAULT;
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "ownerName";
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "ownerEmail";

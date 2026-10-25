-- API keys require an owner and an expiry.
-- Existing rows: expiresAt = now + 90 days, ownerEmail = creating user's email.
-- Reverse with prisma/migrations/20261023130000_api_key_owner_expiry/down.sql

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "ownerEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "ownerName" TEXT NOT NULL DEFAULT '';

UPDATE "api_keys" AS k
SET "expiresAt" = CURRENT_TIMESTAMP + INTERVAL '90 days'
WHERE k."expiresAt" IS NULL;

UPDATE "api_keys" AS k
SET "ownerEmail" = u."email"
FROM "users" u
WHERE k."userId" = u."id"
  AND k."ownerEmail" = '';

ALTER TABLE "api_keys" ALTER COLUMN "expiresAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '90 days');
ALTER TABLE "api_keys" ALTER COLUMN "expiresAt" SET NOT NULL;

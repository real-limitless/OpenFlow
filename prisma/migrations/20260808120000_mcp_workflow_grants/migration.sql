-- ApiKey policy fields (legacy keys stay unrestricted)
ALTER TABLE "api_keys" ADD COLUMN "restrictWorkflows" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "api_keys" ADD COLUMN "canCreateWorkflows" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "api_keys" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "api_keys" ADD COLUMN "lastUsedAt" TIMESTAMP(3);

-- New keys default restrictWorkflows=true via app; existing rows keep false above.

CREATE TABLE "api_key_workflow_grants" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "canExecute" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_key_workflow_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_key_workflow_grants_apiKeyId_workflowId_key" ON "api_key_workflow_grants"("apiKeyId", "workflowId");
CREATE INDEX "api_key_workflow_grants_workflowId_idx" ON "api_key_workflow_grants"("workflowId");
ALTER TABLE "api_key_workflow_grants" ADD CONSTRAINT "api_key_workflow_grants_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- OAuth authorization code workflow grants payload
ALTER TABLE "oauth_authorization_codes" ADD COLUMN "workflowGrants" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "oauth_token_workflow_grants" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "canExecute" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oauth_token_workflow_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_token_workflow_grants_tokenId_workflowId_key" ON "oauth_token_workflow_grants"("tokenId", "workflowId");
CREATE INDEX "oauth_token_workflow_grants_workflowId_idx" ON "oauth_token_workflow_grants"("workflowId");
ALTER TABLE "oauth_token_workflow_grants" ADD CONSTRAINT "oauth_token_workflow_grants_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "oauth_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Temporary MCP tokens
CREATE TABLE "mcp_temporary_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_temporary_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mcp_temporary_tokens_tokenHash_key" ON "mcp_temporary_tokens"("tokenHash");
CREATE INDEX "mcp_temporary_tokens_userId_idx" ON "mcp_temporary_tokens"("userId");
CREATE INDEX "mcp_temporary_tokens_expiresAt_idx" ON "mcp_temporary_tokens"("expiresAt");
ALTER TABLE "mcp_temporary_tokens" ADD CONSTRAINT "mcp_temporary_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mcp_temporary_grants" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "canExecute" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_temporary_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mcp_temporary_grants_tokenId_workflowId_key" ON "mcp_temporary_grants"("tokenId", "workflowId");
CREATE INDEX "mcp_temporary_grants_workflowId_idx" ON "mcp_temporary_grants"("workflowId");
ALTER TABLE "mcp_temporary_grants" ADD CONSTRAINT "mcp_temporary_grants_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "mcp_temporary_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

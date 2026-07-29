-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "versionId" TEXT NOT NULL,
    "nodes" TEXT NOT NULL DEFAULT '[]',
    "connections" TEXT NOT NULL DEFAULT '{}',
    "settings" TEXT,
    "staticData" TEXT,
    "pinData" TEXT,
    "meta" TEXT,
    "extra" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "mode" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "runData" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dataEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_routes" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT '*',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "webhook_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_triggers" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "cronExpr" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "workflows_userId_idx" ON "workflows"("userId");

-- CreateIndex
CREATE INDEX "executions_workflowId_idx" ON "executions"("workflowId");

-- CreateIndex
CREATE INDEX "executions_status_idx" ON "executions"("status");

-- CreateIndex
CREATE INDEX "credentials_userId_idx" ON "credentials"("userId");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE INDEX "api_keys_keyHash_idx" ON "api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_routes_path_key" ON "webhook_routes"("path");

-- CreateIndex
CREATE INDEX "webhook_routes_workflowId_idx" ON "webhook_routes"("workflowId");

-- CreateIndex
CREATE INDEX "webhook_routes_path_idx" ON "webhook_routes"("path");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_triggers_workflowId_nodeId_key" ON "scheduled_triggers"("workflowId", "nodeId");

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_routes" ADD CONSTRAINT "webhook_routes_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_triggers" ADD CONSTRAINT "scheduled_triggers_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

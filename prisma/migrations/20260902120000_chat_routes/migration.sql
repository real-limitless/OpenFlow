-- CreateTable
CREATE TABLE "chat_routes" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "makeAvailableInChat" BOOLEAN NOT NULL DEFAULT false,
    "agentName" TEXT NOT NULL DEFAULT '',
    "agentDescription" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "chat_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_routes_path_key" ON "chat_routes"("path");

-- CreateIndex
CREATE INDEX "chat_routes_workflowId_idx" ON "chat_routes"("workflowId");

-- CreateIndex
CREATE INDEX "chat_routes_path_idx" ON "chat_routes"("path");

-- CreateIndex
CREATE INDEX "chat_routes_makeAvailableInChat_active_idx" ON "chat_routes"("makeAvailableInChat", "active");

-- AddForeignKey
ALTER TABLE "chat_routes" ADD CONSTRAINT "chat_routes_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

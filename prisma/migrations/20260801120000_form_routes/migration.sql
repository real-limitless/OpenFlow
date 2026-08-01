-- CreateTable
CREATE TABLE "form_routes" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "form_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_routes_path_key" ON "form_routes"("path");

-- CreateIndex
CREATE INDEX "form_routes_workflowId_idx" ON "form_routes"("workflowId");

-- CreateIndex
CREATE INDEX "form_routes_path_idx" ON "form_routes"("path");

-- AddForeignKey
ALTER TABLE "form_routes" ADD CONSTRAINT "form_routes_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

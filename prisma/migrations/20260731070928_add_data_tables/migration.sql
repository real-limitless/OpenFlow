-- CreateTable
CREATE TABLE "data_tables" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "columns" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_table_rows" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_table_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_tables_userId_idx" ON "data_tables"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "data_tables_userId_name_key" ON "data_tables"("userId", "name");

-- CreateIndex
CREATE INDEX "data_table_rows_tableId_position_idx" ON "data_table_rows"("tableId", "position");

-- AddForeignKey
ALTER TABLE "data_tables" ADD CONSTRAINT "data_tables_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_table_rows" ADD CONSTRAINT "data_table_rows_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "data_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

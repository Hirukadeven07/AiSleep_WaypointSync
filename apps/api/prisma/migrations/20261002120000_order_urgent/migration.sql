-- CreateEnum
CREATE TYPE "StockLevel" AS ENUM ('out_of_stock', 'running_low');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "urgent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stockLevel" "StockLevel";

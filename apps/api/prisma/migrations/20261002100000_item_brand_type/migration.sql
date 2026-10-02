-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('chilled_food', 'fresh', 'style', 'tech');

-- AlterTable
ALTER TABLE "Item" ADD COLUMN "brand" "Brand" NOT NULL DEFAULT 'Fresh',
ADD COLUMN "type" "ItemType" NOT NULL DEFAULT 'fresh';

-- CreateIndex
CREATE INDEX "Item_brand_type_idx" ON "Item"("brand", "type");

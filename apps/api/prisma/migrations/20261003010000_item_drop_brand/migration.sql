-- Item.type is the product class. Item.brand repeated the store brand.
DROP INDEX IF EXISTS "Item_brand_type_idx";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "brand";
CREATE INDEX IF NOT EXISTS "Item_type_idx" ON "Item"("type");

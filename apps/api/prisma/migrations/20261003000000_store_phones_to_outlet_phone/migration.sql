-- Move Store.phone onto OutletPhone, then drop the column.
-- phoneNo is not unique: the same number may exist on one store or many.

INSERT INTO "OutletPhone" ("id", "storeId", "phoneNo", "label")
SELECT concat('mig-phone-', s.id), s.id, s.phone, 'shop'
FROM "Store" s
WHERE s.phone IS NOT NULL
  AND btrim(s.phone) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "OutletPhone" p
    WHERE p."storeId" = s.id
      AND p."phoneNo" = s.phone
  );

ALTER TABLE "Store" DROP COLUMN "phone";

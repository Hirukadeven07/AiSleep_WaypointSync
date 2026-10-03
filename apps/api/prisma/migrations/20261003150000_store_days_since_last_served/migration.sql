-- How long since the outlet was last served belongs on the outlet, not on one order.
ALTER TABLE "Store" ADD COLUMN "daysSinceLastServed" INTEGER;

-- Match existing trips: days from the latest served stop to today in Colombo.
UPDATE "Store" AS s
SET "daysSinceLastServed" = src.days
FROM (
  SELECT o."storeId" AS id,
         ((timezone('Asia/Colombo', now()))::date - MAX(t."serviceDate"))::int AS days
  FROM "TripStop" ts
  JOIN "Trip" t ON t.id = ts."tripId"
  JOIN "Order" o ON o.id = ts."orderId"
  WHERE t.status = 'completed'
     OR ts.status IN ('delivered', 'confirmed', 'partial')
  GROUP BY o."storeId"
) AS src
WHERE s.id = src.id
  AND src.days >= 0;

ALTER TABLE "Order" DROP COLUMN IF EXISTS "daysSinceLastServed";

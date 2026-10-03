-- Rename the vehicle registration column and fill a unique number plate where it was empty.
ALTER TABLE "Vehicle" RENAME COLUMN "plate" TO "numberPlate";
ALTER INDEX "Vehicle_plate_key" RENAME TO "Vehicle_numberPlate_key";

WITH numbered AS (
  SELECT id,
         "depotId",
         ROW_NUMBER() OVER (PARTITION BY "depotId" ORDER BY id) AS n
  FROM "Vehicle"
  WHERE "numberPlate" IS NULL
)
UPDATE "Vehicle" AS v
SET "numberPlate" = CASE WHEN n."depotId" = 'Kandy' THEN 'CP' ELSE 'WP' END
  || ' LQ-' || LPAD((1000 + n.n)::text, 4, '0')
FROM numbered AS n
WHERE v.id = n.id;

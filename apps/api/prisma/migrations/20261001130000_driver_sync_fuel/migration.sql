ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "lastConfirmedLitres" DOUBLE PRECISION;

ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "fuelLitresAtEnd" DOUBLE PRECISION;

ALTER TABLE "DriverEvent" ALTER COLUMN "tripId" DROP NOT NULL;
ALTER TABLE "DriverEvent" ALTER COLUMN "seenPlanVersion" DROP NOT NULL;
ALTER TABLE "DriverEvent" ALTER COLUMN "appliedAt" SET DEFAULT CURRENT_TIMESTAMP;
UPDATE "DriverEvent" SET "appliedAt" = "createdOnPhoneAt" WHERE "appliedAt" IS NULL;
ALTER TABLE "DriverEvent" ALTER COLUMN "appliedAt" SET NOT NULL;

ALTER TABLE "DriverEvent"
  DROP CONSTRAINT IF EXISTS "DriverEvent_tripId_fkey";

ALTER TABLE "DriverEvent"
  ADD CONSTRAINT "DriverEvent_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "DriverEvent_driverId_type_appliedAt_idx"
ON "DriverEvent"("driverId", "type", "appliedAt");

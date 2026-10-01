-- SOS with no active trip: tripId and seenPlanVersion may be null.
-- appliedAt stays nullable until POST /api/sync actually applies the row.

ALTER TABLE "DriverEvent" ALTER COLUMN "tripId" DROP NOT NULL;
ALTER TABLE "DriverEvent" ALTER COLUMN "seenPlanVersion" DROP NOT NULL;

ALTER TABLE "DriverEvent" DROP CONSTRAINT "DriverEvent_tripId_fkey";
ALTER TABLE "DriverEvent" ADD CONSTRAINT "DriverEvent_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

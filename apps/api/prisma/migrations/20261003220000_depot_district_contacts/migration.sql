-- Depot contact and yard position. Ids become depo1 (Peliyagoda) and depo2 (Kandy).
ALTER TABLE "Depot" ADD COLUMN "telephone" TEXT;
ALTER TABLE "Depot" ADD COLUMN "email" TEXT;
ALTER TABLE "Depot" ADD COLUMN "address" TEXT;
ALTER TABLE "Depot" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Depot" ADD COLUMN "lng" DOUBLE PRECISION;

UPDATE "Depot" SET "id" = 'depo1' WHERE "id" = 'Peliyagoda';
UPDATE "Depot" SET "id" = 'depo2' WHERE "id" = 'Kandy';
UPDATE "LoadingJob" SET "depot" = 'depo1' WHERE "depot" = 'Peliyagoda';
UPDATE "LoadingJob" SET "depot" = 'depo2' WHERE "depot" = 'Kandy';

-- District name is the primary key. Drop the id links first, then store the name.
ALTER TABLE "Store" DROP CONSTRAINT "Store_districtId_fkey";
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_districtId_fkey";
ALTER TABLE "_TripExtraDistricts" DROP CONSTRAINT "_TripExtraDistricts_A_fkey";

UPDATE "Store" s SET "districtId" = d."name" FROM "District" d WHERE s."districtId" = d."id";
UPDATE "Trip" t SET "districtId" = d."name" FROM "District" d WHERE t."districtId" = d."id";
UPDATE "_TripExtraDistricts" x SET "A" = d."name" FROM "District" d WHERE x."A" = d."id";

ALTER TABLE "District" DROP CONSTRAINT "District_pkey";
DROP INDEX IF EXISTS "District_name_key";
ALTER TABLE "District" DROP COLUMN "id";
ALTER TABLE "District" ADD CONSTRAINT "District_pkey" PRIMARY KEY ("name");

ALTER TABLE "Store" ADD CONSTRAINT "Store_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "_TripExtraDistricts" ADD CONSTRAINT "_TripExtraDistricts_A_fkey" FOREIGN KEY ("A") REFERENCES "District"("name") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Store" ADD COLUMN "address" TEXT;
ALTER TABLE "Store" ADD COLUMN "email" TEXT;

ALTER TABLE "Driver" ADD COLUMN "address" TEXT;
ALTER TABLE "Loader" ADD COLUMN "address" TEXT;
ALTER TABLE "Dispatcher" ADD COLUMN "email" TEXT;
ALTER TABLE "Dispatcher" ADD COLUMN "address" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "lastServiceAt" TIMESTAMP(3);
ALTER TABLE "LoadFlag" ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE TABLE "LoaderPhone" (
    "phoneNumber" TEXT NOT NULL,
    "loaderId" TEXT NOT NULL,
    CONSTRAINT "LoaderPhone_pkey" PRIMARY KEY ("phoneNumber")
);

CREATE TABLE "DispatcherPhone" (
    "phoneNumber" TEXT NOT NULL,
    "dispatcherId" TEXT NOT NULL,
    CONSTRAINT "DispatcherPhone_pkey" PRIMARY KEY ("phoneNumber")
);

ALTER TABLE "LoaderPhone" ADD CONSTRAINT "LoaderPhone_loaderId_fkey" FOREIGN KEY ("loaderId") REFERENCES "Loader"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispatcherPhone" ADD CONSTRAINT "DispatcherPhone_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

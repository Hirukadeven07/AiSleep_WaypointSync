-- CreateEnum
CREATE TYPE "PhoneLabel" AS ENUM ('shop', 'manager', 'warehouse');

-- CreateEnum
CREATE TYPE "LoaderShift" AS ENUM ('morning', 'night');

-- CreateEnum
CREATE TYPE "LoaderNoteRole" AS ENUM ('picking', 'confirming');

-- CreateEnum
CREATE TYPE "FieldFlagDecision" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "LoaderFlagScope" AS ENUM ('item', 'dn');

-- CreateEnum
CREATE TYPE "LoaderFlagStatus" AS ENUM ('pending_dispatcher', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "LoadingJobStatus" AS ENUM ('assigned', 'picking', 'loaded', 'handed_over', 'cancelled');

-- CreateEnum
CREATE TYPE "FlagSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "SosSeverity" AS ENUM ('low', 'high', 'critical');

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN "itemId" TEXT;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "assignedDriverId" TEXT,
ADD COLUMN "csvRouteId" TEXT,
ADD COLUMN "tripStartingDate" DATE,
ADD COLUMN "tripEndingDate" DATE,
ADD COLUMN "startingTime" TIMESTAMP(3),
ADD COLUMN "estimatedStartingTime" TIMESTAMP(3),
ADD COLUMN "endingTime" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TripStop" ADD COLUMN "plannedArrivalTime" TIMESTAMP(3),
ADD COLUMN "leaveOutletTime" TIMESTAMP(3),
ADD COLUMN "serviceMin" DOUBLE PRECISION,
ADD COLUMN "unloadingTime" DOUBLE PRECISION,
ADD COLUMN "estimatedUnloadingTime" DOUBLE PRECISION,
ADD COLUMN "estimatedTripStopTime" TIMESTAMP(3),
ADD COLUMN "tripStopTime" TIMESTAMP(3),
ADD COLUMN "tripStartTime" TIMESTAMP(3),
ADD COLUMN "estimatedTripStartTime" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OutletPhone" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "phoneNo" TEXT NOT NULL,
    "label" "PhoneLabel" NOT NULL,

    CONSTRAINT "OutletPhone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "isChilled" BOOLEAN NOT NULL DEFAULT false,
    "packLabel" TEXT,
    "packWeightKg" DOUBLE PRECISION,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchName" TEXT,
    "manufacturingDate" DATE,
    "expiryDate" DATE,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "licenseNo" TEXT,
    "idNo" TEXT,
    "joinDate" DATE,
    "leavingDate" DATE,
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverPhone" (
    "phoneNumber" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,

    CONSTRAINT "DriverPhone_pkey" PRIMARY KEY ("phoneNumber")
);

-- CreateTable
CREATE TABLE "Loader" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeNo" TEXT,
    "idNo" TEXT,
    "shift" "LoaderShift",
    "joinDate" DATE,
    "leavingDate" DATE,
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Loader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatcher" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeNo" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Dispatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteLeg" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "fromPoint" TEXT,
    "toOutlet" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "plannedDepartTime" TIMESTAMP(3),
    "plannedTravelMin" DOUBLE PRECISION,
    "actualDepartTime" TIMESTAMP(3),
    "actualTravelMin" DOUBLE PRECISION,
    "monsoon" BOOLEAN,
    "trafficBand" TEXT,

    CONSTRAINT "RouteLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadingJob" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "depot" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bay" TEXT,
    "loadByTime" TIMESTAMP(3),
    "instructions" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "LoadingJobStatus" NOT NULL DEFAULT 'assigned',
    "startedAt" TIMESTAMP(3),
    "loadedAt" TIMESTAMP(3),
    "handedOverAt" TIMESTAMP(3),
    "totalWeightKg" DOUBLE PRECISION,
    "totalVolumeM3" DOUBLE PRECISION,

    CONSTRAINT "LoadingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "dnId" TEXT NOT NULL,
    "versionAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT,
    "validTo" TIMESTAMP(3),
    "changedById" TEXT,
    "changeReason" TEXT,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("dnId","versionAt")
);

-- CreateTable
CREATE TABLE "DeliveryNoteLine" (
    "id" TEXT NOT NULL,
    "dnId" TEXT NOT NULL,
    "versionAt" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT NOT NULL,
    "qtyConfirmed" DOUBLE PRECISION,
    "shortageReason" TEXT,

    CONSTRAINT "DeliveryNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNotePick" (
    "id" TEXT NOT NULL,
    "dnLineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DeliveryNotePick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNoteLoader" (
    "id" TEXT NOT NULL,
    "dnId" TEXT NOT NULL,
    "versionAt" TIMESTAMP(3) NOT NULL,
    "loaderId" TEXT NOT NULL,
    "role" "LoaderNoteRole",
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryNoteLoader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldFlag" (
    "id" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tripId" TEXT,
    "itemId" TEXT,
    "qtyFlagged" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "reasonDetail" TEXT,
    "severity" "FlagSeverity",
    "driverDecision" "FieldFlagDecision" NOT NULL DEFAULT 'pending',
    "driverDecidedAt" TIMESTAMP(3),
    "driverNote" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "FieldFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoaderFlag" (
    "id" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loaderId" TEXT NOT NULL,
    "dnId" TEXT NOT NULL,
    "versionAt" TIMESTAMP(3) NOT NULL,
    "scope" "LoaderFlagScope" NOT NULL,
    "itemId" TEXT,
    "qtyFlagged" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "reasonDetail" TEXT,
    "validationStatus" "LoaderFlagStatus" NOT NULL DEFAULT 'pending_dispatcher',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "LoaderFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverIncident" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "tripId" TEXT,
    "vehicleId" TEXT,
    "incidentType" TEXT NOT NULL,
    "severity" "SosSeverity" NOT NULL,
    "message" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "lastStopId" TEXT,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "reassignedTripId" TEXT,

    CONSTRAINT "DriverIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "speedKmh" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_licenseNo_key" ON "Driver"("licenseNo");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_idNo_key" ON "Driver"("idNo");

-- CreateIndex
CREATE UNIQUE INDEX "Loader_userId_key" ON "Loader"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Loader_employeeNo_key" ON "Loader"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Loader_idNo_key" ON "Loader"("idNo");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatcher_userId_key" ON "Dispatcher"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatcher_employeeNo_key" ON "Dispatcher"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "RouteLeg_tripId_seq_key" ON "RouteLeg"("tripId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "LoadingJob_tripId_key" ON "LoadingJob"("tripId");

-- CreateIndex
CREATE INDEX "DeliveryNote_dnId_idx" ON "DeliveryNote"("dnId");

-- CreateIndex
CREATE INDEX "DeliveryNote_orderId_idx" ON "DeliveryNote"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNoteLoader_dnId_versionAt_loaderId_key" ON "DeliveryNoteLoader"("dnId", "versionAt", "loaderId");

-- CreateIndex
CREATE INDEX "FieldFlag_orderId_idx" ON "FieldFlag"("orderId");

-- CreateIndex
CREATE INDEX "LoaderFlag_dnId_idx" ON "LoaderFlag"("dnId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationPing_clientUuid_key" ON "LocationPing"("clientUuid");

-- CreateIndex
CREATE INDEX "LocationPing_tripId_recordedAt_idx" ON "LocationPing"("tripId", "recordedAt");

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletPhone" ADD CONSTRAINT "OutletPhone_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPhone" ADD CONSTRAINT "DriverPhone_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loader" ADD CONSTRAINT "Loader_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatcher" ADD CONSTRAINT "Dispatcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteLeg" ADD CONSTRAINT "RouteLeg_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadingJob" ADD CONSTRAINT "LoadingJob_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadingJob" ADD CONSTRAINT "LoadingJob_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Dispatcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "Loader"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_dnId_versionAt_fkey" FOREIGN KEY ("dnId", "versionAt") REFERENCES "DeliveryNote"("dnId", "versionAt") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNotePick" ADD CONSTRAINT "DeliveryNotePick_dnLineId_fkey" FOREIGN KEY ("dnLineId") REFERENCES "DeliveryNoteLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNotePick" ADD CONSTRAINT "DeliveryNotePick_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLoader" ADD CONSTRAINT "DeliveryNoteLoader_dnId_versionAt_fkey" FOREIGN KEY ("dnId", "versionAt") REFERENCES "DeliveryNote"("dnId", "versionAt") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLoader" ADD CONSTRAINT "DeliveryNoteLoader_loaderId_fkey" FOREIGN KEY ("loaderId") REFERENCES "Loader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldFlag" ADD CONSTRAINT "FieldFlag_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldFlag" ADD CONSTRAINT "FieldFlag_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldFlag" ADD CONSTRAINT "FieldFlag_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldFlag" ADD CONSTRAINT "FieldFlag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoaderFlag" ADD CONSTRAINT "LoaderFlag_loaderId_fkey" FOREIGN KEY ("loaderId") REFERENCES "Loader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoaderFlag" ADD CONSTRAINT "LoaderFlag_dnId_versionAt_fkey" FOREIGN KEY ("dnId", "versionAt") REFERENCES "DeliveryNote"("dnId", "versionAt") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoaderFlag" ADD CONSTRAINT "LoaderFlag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoaderFlag" ADD CONSTRAINT "LoaderFlag_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Dispatcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverIncident" ADD CONSTRAINT "DriverIncident_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverIncident" ADD CONSTRAINT "DriverIncident_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverIncident" ADD CONSTRAINT "DriverIncident_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverIncident" ADD CONSTRAINT "DriverIncident_lastStopId_fkey" FOREIGN KEY ("lastStopId") REFERENCES "TripStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverIncident" ADD CONSTRAINT "DriverIncident_reassignedTripId_fkey" FOREIGN KEY ("reassignedTripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

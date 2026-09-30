-- CreateEnum
CREATE TYPE "Role" AS ENUM ('dispatcher', 'store', 'loader', 'driver');

-- CreateEnum
CREATE TYPE "Brand" AS ENUM ('Fresh', 'Style', 'Tech');

-- CreateEnum
CREATE TYPE "Temp" AS ENUM ('chilled', 'ambient');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('truck', 'van');

-- CreateEnum
CREATE TYPE "VehicleTemp" AS ENUM ('reefer', 'ambient');

-- CreateEnum
CREATE TYPE "DockType" AS ENUM ('rear_dock', 'street', 'mall_bay');

-- CreateEnum
CREATE TYPE "ParkingConstraint" AS ENUM ('normal', 'van_only', 'mall_dock');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('waiting', 'planned', 'deferred', 'delivered', 'partial');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('planning', 'published', 'loading', 'ready', 'on_road', 'completed', 'breakdown');

-- CreateEnum
CREATE TYPE "StopStatus" AS ENUM ('upcoming', 'arrived', 'waiting', 'confirmed', 'delivered', 'partial', 'deferred', 'at_risk');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('available', 'out_of_service', 'on_road');

-- CreateEnum
CREATE TYPE "FlagType" AS ENUM ('missing', 'damaged', 'wrong_quantity');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('breakdown', 'delay', 'quiet_driver', 'wait_timeout');

-- CreateTable
CREATE TABLE "Depot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Depot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "depotId" TEXT,
    "served" BOOLEAN NOT NULL DEFAULT true,
    "roadClass" TEXT,
    "freeFlowKmh" DOUBLE PRECISION,
    "depotToDistrictKm" DOUBLE PRECISION,
    "depotToDistrictMin" INTEGER,
    "interStopKm" DOUBLE PRECISION,
    "interStopMin" INTEGER,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAllowance" (
    "id" TEXT NOT NULL,
    "brand" "Brand" NOT NULL,
    "dockType" "DockType" NOT NULL,
    "minutes" INTEGER NOT NULL,

    CONSTRAINT "ServiceAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarDay" (
    "id" DATE NOT NULL,
    "dow" INTEGER NOT NULL,
    "isWeekend" BOOLEAN NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "isPayday" BOOLEAN NOT NULL,
    "festival" TEXT,
    "festivalRamp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isHoliday" BOOLEAN NOT NULL,
    "monsoon" BOOLEAN NOT NULL,
    "isOperating" BOOLEAN NOT NULL,

    CONSTRAINT "CalendarDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficSpeed" (
    "id" TEXT NOT NULL,
    "districtName" TEXT NOT NULL,
    "hour" INTEGER,
    "monsoon" BOOLEAN,
    "speedIndex" DOUBLE PRECISION,
    "raw" JSONB NOT NULL,

    CONSTRAINT "TrafficSpeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadCondition" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "districtName" TEXT NOT NULL,
    "disruptionIndex" DOUBLE PRECISION,
    "raw" JSONB NOT NULL,

    CONSTRAINT "RoadCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "displayName" TEXT,
    "brand" "Brand" NOT NULL,
    "districtId" TEXT NOT NULL,
    "depotId" TEXT NOT NULL,
    "dockType" "DockType" NOT NULL,
    "parkingConstraint" "ParkingConstraint" NOT NULL DEFAULT 'normal',
    "mallWindow" TEXT,
    "windowOpenMin" INTEGER NOT NULL,
    "windowCloseMin" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "name" TEXT NOT NULL,
    "depotId" TEXT,
    "storeId" TEXT,
    "passwordHash" TEXT,
    "pinHash" TEXT,
    "phone" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "plate" TEXT,
    "depotId" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "temp" "VehicleTemp" NOT NULL,
    "weightCapKg" DOUBLE PRECISION NOT NULL,
    "volumeCapM3" DOUBLE PRECISION NOT NULL,
    "fuelType" TEXT,
    "kmPerL" DOUBLE PRECISION,
    "weeklyFuelQuotaL" DOUBLE PRECISION,
    "status" "VehicleStatus" NOT NULL DEFAULT 'available',
    "outOfServiceReason" TEXT,
    "returnDate" DATE,
    "driverId" TEXT,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "brand" "Brand" NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "temp" "Temp" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'waiting',
    "units" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "volumeM3" DOUBLE PRECISION NOT NULL,
    "urgentNote" TEXT,
    "movedFromDate" DATE,
    "deferReason" TEXT,
    "deferredById" TEXT,
    "deferredYesterday" BOOLEAN NOT NULL DEFAULT false,
    "daysSinceLastServed" INTEGER,
    "repeatSkip" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "pack" TEXT NOT NULL,
    "chilled" BOOLEAN NOT NULL DEFAULT false,
    "unitWeightKg" DOUBLE PRECISION NOT NULL,
    "unitVolumeM3" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "depotId" TEXT NOT NULL,
    "brand" "Brand" NOT NULL,
    "districtId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "tripNumber" INTEGER NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'planning',
    "planVersion" INTEGER NOT NULL DEFAULT 1,
    "plannedMinutes" INTEGER,
    "plannedLitres" DOUBLE PRECISION,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripStop" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "StopStatus" NOT NULL DEFAULT 'upcoming',
    "etaMin" INTEGER,
    "arrivedAt" TIMESTAMP(3),
    "storeConfirmedAt" TIMESTAMP(3),
    "driverAckAt" TIMESTAMP(3),

    CONSTRAINT "TripStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadSession" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "loaderIds" TEXT[],
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "departedAt" TIMESTAMP(3),
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "ackedPlanVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LoadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadFlag" (
    "id" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "orderLineId" TEXT,
    "type" "FlagType" NOT NULL,
    "qty" INTEGER,
    "note" TEXT,
    "photoKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoadFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreReceipt" (
    "id" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "lineResults" JSONB NOT NULL,
    "chilledWasCold" BOOLEAN,
    "photoKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdOnPhoneAt" TIMESTAMP(3) NOT NULL,
    "seenPlanVersion" INTEGER NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "DriverEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "tripId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "timeline" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "District_name_key" ON "District"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAllowance_brand_dockType_key" ON "ServiceAllowance"("brand", "dockType");

-- CreateIndex
CREATE UNIQUE INDEX "User_loginId_key" ON "User"("loginId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_driverId_key" ON "Vehicle"("driverId");

-- CreateIndex
CREATE INDEX "Order_deliveryDate_status_idx" ON "Order"("deliveryDate", "status");

-- CreateIndex
CREATE INDEX "Trip_depotId_serviceDate_idx" ON "Trip"("depotId", "serviceDate");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_vehicleId_serviceDate_tripNumber_key" ON "Trip"("vehicleId", "serviceDate", "tripNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TripStop_orderId_key" ON "TripStop"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "TripStop_tripId_sequence_key" ON "TripStop"("tripId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "LoadSession_tripId_key" ON "LoadSession"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreReceipt_stopId_key" ON "StoreReceipt"("stopId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverEvent_clientId_key" ON "DriverEvent"("clientId");

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadSession" ADD CONSTRAINT "LoadSession_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadFlag" ADD CONSTRAINT "LoadFlag_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "TripStop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadFlag" ADD CONSTRAINT "LoadFlag_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreReceipt" ADD CONSTRAINT "StoreReceipt_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "TripStop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverEvent" ADD CONSTRAINT "DriverEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

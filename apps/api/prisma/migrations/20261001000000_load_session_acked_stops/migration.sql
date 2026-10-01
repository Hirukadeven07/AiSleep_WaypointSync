-- AlterTable
ALTER TABLE "LoadSession" ADD COLUMN     "ackedStopIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

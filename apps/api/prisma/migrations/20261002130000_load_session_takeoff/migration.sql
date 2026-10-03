-- AlterTable
ALTER TABLE "LoadSession" ADD COLUMN "takenOffOrderIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "newOrderIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- A shop problem stays open until a replacement of that item is ordered, or the flag is marked solved.
ALTER TABLE "FieldFlag" ADD COLUMN "resolveStatus" BOOLEAN NOT NULL DEFAULT false;

UPDATE "FieldFlag" SET "resolveStatus" = true WHERE "resolvedAt" IS NOT NULL;

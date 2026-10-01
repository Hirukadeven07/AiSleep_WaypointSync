-- Photo object keys live on the owning row. Bytes stay in MinIO (or PHOTO_FALLBACK_DIR).

ALTER TABLE "StoreReceipt" ADD COLUMN "signaturePhotoKey" TEXT;
ALTER TABLE "StoreReceipt" ADD COLUMN "signedByUserId" TEXT;
ALTER TABLE "StoreReceipt" ADD COLUMN "signedAt" TIMESTAMP(3);

ALTER TABLE "StoreReceipt" ADD CONSTRAINT "StoreReceipt_signedByUserId_fkey"
  FOREIGN KEY ("signedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FieldFlag" ADD COLUMN "photoKey" TEXT;
ALTER TABLE "LoaderFlag" ADD COLUMN "photoKey" TEXT;

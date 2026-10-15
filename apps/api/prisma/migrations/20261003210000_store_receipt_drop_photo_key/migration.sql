-- The storekeeper confirmation is signaturePhotoKey. StoreReceipt has no separate photo.
ALTER TABLE "StoreReceipt" DROP COLUMN "photoKey";

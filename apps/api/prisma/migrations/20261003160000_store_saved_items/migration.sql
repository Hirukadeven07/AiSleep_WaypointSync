-- Items a store manager starred on the order screen, one row per store and item.
CREATE TABLE "StoreSavedItem" (
    "storeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreSavedItem_pkey" PRIMARY KEY ("storeId","itemId")
);

ALTER TABLE "StoreSavedItem" ADD CONSTRAINT "StoreSavedItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoreSavedItem" ADD CONSTRAINT "StoreSavedItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

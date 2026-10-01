-- DriverEvent.driver relation (added with the sync API) was missing its foreign key.
ALTER TABLE "DriverEvent" ADD CONSTRAINT "DriverEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

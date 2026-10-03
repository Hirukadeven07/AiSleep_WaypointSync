-- CreateTable
CREATE TABLE "_TripExtraDistricts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_TripExtraDistricts_AB_unique" ON "_TripExtraDistricts"("A", "B");

-- CreateIndex
CREATE INDEX "_TripExtraDistricts_B_index" ON "_TripExtraDistricts"("B");

-- AddForeignKey
ALTER TABLE "_TripExtraDistricts" ADD CONSTRAINT "_TripExtraDistricts_A_fkey" FOREIGN KEY ("A") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TripExtraDistricts" ADD CONSTRAINT "_TripExtraDistricts_B_fkey" FOREIGN KEY ("B") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

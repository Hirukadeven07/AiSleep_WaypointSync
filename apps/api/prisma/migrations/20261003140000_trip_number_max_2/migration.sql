-- A vehicle has at most two trips on a service date: morning (1) and afternoon (2).
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_tripNumber_max_2"
  CHECK ("tripNumber" >= 1 AND "tripNumber" <= 2);

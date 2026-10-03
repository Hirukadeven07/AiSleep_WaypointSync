-- Return time keeps the clock time, not only the calendar day.
ALTER TABLE "Vehicle" ALTER COLUMN "returnDate" TYPE TIMESTAMP(3)
  USING CASE WHEN "returnDate" IS NULL THEN NULL ELSE "returnDate"::timestamp END;

-- Any row already out of service must satisfy the check below.
UPDATE "Vehicle"
SET "outOfServiceReason" = 'Out of service'
WHERE status = 'out_of_service'
  AND ("outOfServiceReason" IS NULL OR btrim("outOfServiceReason") = '');

-- Unavailable (out of service) requires a reason. The return time stays optional.
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_out_of_service_needs_reason"
  CHECK (
    status <> 'out_of_service'
    OR ("outOfServiceReason" IS NOT NULL AND btrim("outOfServiceReason") <> '')
  );

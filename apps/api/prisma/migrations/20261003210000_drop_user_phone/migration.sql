-- A person's number lives on DriverPhone or OutletPhone, not on the login account.
INSERT INTO "DriverPhone" ("phoneNumber", "driverId")
SELECT DISTINCT ON (btrim(u.phone)) btrim(u.phone), d.id
FROM "User" u
JOIN "Driver" d ON d."userId" = u.id
WHERE u.phone IS NOT NULL
  AND btrim(u.phone) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "DriverPhone" p WHERE p."phoneNumber" = btrim(u.phone)
  )
ORDER BY btrim(u.phone), d.id;

ALTER TABLE "User" DROP COLUMN IF EXISTS "phone";

-- The starter's default was Europe/Paris: one hour behind Israel all year. It
-- set the hour every email body printed, the admin's day view, and how the
-- barber's working hours map onto real clock time.
UPDATE "Barber" SET "timezone" = 'Asia/Jerusalem' WHERE "timezone" <> 'Asia/Jerusalem';

-- AlterTable
ALTER TABLE "Barber" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Jerusalem';

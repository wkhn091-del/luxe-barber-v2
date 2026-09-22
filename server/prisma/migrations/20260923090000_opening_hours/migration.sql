-- AlterTable
ALTER TABLE "Barber" ADD COLUMN     "openingHours" TEXT;

-- Carry over the text the site showed until now, so nothing changes on deploy.
-- From here on the barber edits it in the admin (פרטי העסק → שעות פעילות).
UPDATE "Barber" SET "openingHours" = 'שלישי – שבת, 09:00–19:00' WHERE "openingHours" IS NULL;

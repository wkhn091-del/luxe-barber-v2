-- AlterTable
ALTER TABLE "Barber" ADD COLUMN     "vacationMessage" TEXT,
ADD COLUMN     "vacationMode" BOOLEAN NOT NULL DEFAULT false;

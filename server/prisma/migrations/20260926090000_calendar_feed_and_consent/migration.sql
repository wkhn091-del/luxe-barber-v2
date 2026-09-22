-- AlterTable
ALTER TABLE "Barber" ADD COLUMN     "calendarFeedToken" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "marketingOptInAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Barber_calendarFeedToken_key" ON "Barber"("calendarFeedToken");

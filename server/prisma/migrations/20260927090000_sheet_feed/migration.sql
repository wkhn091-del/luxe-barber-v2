-- AlterTable
ALTER TABLE "Barber" ADD COLUMN     "sheetFeedToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Barber_sheetFeedToken_key" ON "Barber"("sheetFeedToken");

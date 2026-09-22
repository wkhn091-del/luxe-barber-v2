-- AlterTable
ALTER TABLE "Barber" ADD COLUMN     "wazeUrl" TEXT;

-- CreateTable
CREATE TABLE "WhatsappAuth" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappAuth_pkey" PRIMARY KEY ("id")
);

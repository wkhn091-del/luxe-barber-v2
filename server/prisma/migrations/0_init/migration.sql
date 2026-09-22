-- ===========================================================================
--  LUXE BARBER — initial schema
-- ===========================================================================
--
--  Applied by `npm run db:setup` (prisma migrate deploy). Nothing in here
--  needs to be run by hand.
--
--  The last statement in this file is the one that matters most: a GiST
--  exclusion constraint that makes double-booking structurally impossible.
--  See the block above it for why it uses tsrange and not tstzrange.
-- ===========================================================================

-- CreateEnum
CREATE TYPE "ExceptionKind" AS ENUM ('OPEN', 'BLOCK');
CREATE TYPE "AppointmentStatus" AS ENUM ('HELD', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'OFFER_EXPIRED');
CREATE TYPE "BookingSource" AS ENUM ('WEB', 'WAITLIST', 'FLASH', 'ADMIN');
CREATE TYPE "WaitlistStatus" AS ENUM ('ACTIVE', 'OFFERED', 'CONVERTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "TimePreference" AS ENUM ('ANY', 'MORNING', 'AFTERNOON', 'EVENING');
CREATE TYPE "OfferStatus" AS ENUM ('SENT', 'CONFIRMED', 'DECLINED', 'EXPIRED', 'SUPERSEDED');
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Barber" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "slotGranularityMin" INTEGER NOT NULL DEFAULT 15,
    "bufferMin" INTEGER NOT NULL DEFAULT 5,
    "minLeadTimeMin" INTEGER NOT NULL DEFAULT 60,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 60,
    "offerTtlMin" INTEGER NOT NULL DEFAULT 15,
    "offerMinTtlMin" INTEGER NOT NULL DEFAULT 2,
    "offerLeadBufferMin" INTEGER NOT NULL DEFAULT 10,
    "maxMissedOffers" INTEGER NOT NULL DEFAULT 3,
    "email" TEXT,
    "phone" TEXT,
    "addressLine" TEXT,
    "instagramUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Barber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminDevice" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "accentColor" TEXT DEFAULT '#C6A15B',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkingHoursRule" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkingHoursRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleException" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "kind" "ExceptionKind" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "smsOptIn" BOOLEAN NOT NULL DEFAULT true,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT true,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "BookingSource" NOT NULL DEFAULT 'WEB',
    "holdExpiresAt" TIMESTAMP(3),
    "manageToken" TEXT NOT NULL,
    "clientNote" TEXT,
    "adminNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "reminder24SentAt" TIMESTAMP(3),
    "reminder2SentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "earliestDate" TIMESTAMP(3) NOT NULL,
    "latestDate" TIMESTAMP(3) NOT NULL,
    "weekdayMask" INTEGER NOT NULL DEFAULT 127,
    "timePref" "TimePreference" NOT NULL DEFAULT 'ANY',
    "status" "WaitlistStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "missedOffers" INTEGER NOT NULL DEFAULT 0,
    "lastOfferedAt" TIMESTAMP(3),
    "manageToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlotOffer" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "waitlistEntryId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "slotStartAt" TIMESTAMP(3) NOT NULL,
    "slotEndAt" TIMESTAMP(3) NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'SENT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "token" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SlotOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlashBroadcast" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "slotStartAt" TIMESTAMP(3) NOT NULL,
    "slotEndAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "bookedById" TEXT,
    "bookedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlashBroadcast_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GalleryItem" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "beforeUrl" TEXT NOT NULL,
    "afterUrl" TEXT NOT NULL,
    "beforeBlurhash" TEXT,
    "afterBlurhash" TEXT,
    "caption" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GalleryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Barber_slug_key" ON "Barber"("slug");
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
CREATE UNIQUE INDEX "AdminDevice_secretHash_key" ON "AdminDevice"("secretHash");
CREATE INDEX "AdminDevice_adminUserId_revokedAt_idx" ON "AdminDevice"("adminUserId", "revokedAt");
CREATE INDEX "AdminDevice_lockedUntil_idx" ON "AdminDevice"("lockedUntil");
CREATE INDEX "Service_barberId_active_sortOrder_idx" ON "Service"("barberId", "active", "sortOrder");
CREATE INDEX "WorkingHoursRule_barberId_weekday_active_idx" ON "WorkingHoursRule"("barberId", "weekday", "active");
CREATE INDEX "ScheduleException_barberId_startAt_endAt_idx" ON "ScheduleException"("barberId", "startAt", "endAt");
CREATE INDEX "ScheduleException_barberId_kind_idx" ON "ScheduleException"("barberId", "kind");
CREATE UNIQUE INDEX "Client_phone_key" ON "Client"("phone");
CREATE INDEX "Client_phone_idx" ON "Client"("phone");
CREATE UNIQUE INDEX "Appointment_manageToken_key" ON "Appointment"("manageToken");
CREATE INDEX "Appointment_barberId_startAt_idx" ON "Appointment"("barberId", "startAt");
CREATE INDEX "Appointment_barberId_status_startAt_idx" ON "Appointment"("barberId", "status", "startAt");
CREATE INDEX "Appointment_status_holdExpiresAt_idx" ON "Appointment"("status", "holdExpiresAt");
CREATE INDEX "Appointment_clientId_startAt_idx" ON "Appointment"("clientId", "startAt");
CREATE UNIQUE INDEX "WaitlistEntry_manageToken_key" ON "WaitlistEntry"("manageToken");
CREATE INDEX "WaitlistEntry_barberId_status_priority_createdAt_idx" ON "WaitlistEntry"("barberId", "status", "priority", "createdAt");
CREATE INDEX "WaitlistEntry_barberId_status_earliestDate_latestDate_idx" ON "WaitlistEntry"("barberId", "status", "earliestDate", "latestDate");
CREATE INDEX "WaitlistEntry_clientId_status_idx" ON "WaitlistEntry"("clientId", "status");
CREATE UNIQUE INDEX "SlotOffer_appointmentId_key" ON "SlotOffer"("appointmentId");
CREATE UNIQUE INDEX "SlotOffer_token_key" ON "SlotOffer"("token");
CREATE INDEX "SlotOffer_status_expiresAt_idx" ON "SlotOffer"("status", "expiresAt");
CREATE INDEX "SlotOffer_barberId_slotStartAt_idx" ON "SlotOffer"("barberId", "slotStartAt");
CREATE INDEX "SlotOffer_waitlistEntryId_status_idx" ON "SlotOffer"("waitlistEntryId", "status");
CREATE INDEX "FlashBroadcast_barberId_createdAt_idx" ON "FlashBroadcast"("barberId", "createdAt");
CREATE INDEX "GalleryItem_barberId_published_sortOrder_idx" ON "GalleryItem"("barberId", "published", "sortOrder");
CREATE INDEX "NotificationLog_status_nextAttemptAt_idx" ON "NotificationLog"("status", "nextAttemptAt");
CREATE INDEX "NotificationLog_clientId_createdAt_idx" ON "NotificationLog"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminDevice" ADD CONSTRAINT "AdminDevice_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkingHoursRule" ADD CONSTRAINT "WorkingHoursRule_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlotOffer" ADD CONSTRAINT "SlotOffer_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlotOffer" ADD CONSTRAINT "SlotOffer_waitlistEntryId_fkey" FOREIGN KEY ("waitlistEntryId") REFERENCES "WaitlistEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlotOffer" ADD CONSTRAINT "SlotOffer_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlashBroadcast" ADD CONSTRAINT "FlashBroadcast_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GalleryItem" ADD CONSTRAINT "GalleryItem_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
--  SLOT INTEGRITY — the constraint the whole product rests on
-- ===========================================================================
--
--  Two appointments for the same barber may not overlap in time while either
--  is in a blocking state:
--
--      HELD      a live waitlist offer is reserving this slot
--      PENDING   awaiting client verification
--      CONFIRMED booked
--
--  CANCELLED / OFFER_EXPIRED / COMPLETED / NO_SHOW fall out of the predicate,
--  so flipping a status is all it takes to release a slot — atomically, inside
--  the same transaction that cascades the waitlist.
--
--  ---------------------------------------------------------------------------
--  WHY tsrange AND NOT tstzrange
--  ---------------------------------------------------------------------------
--  Postgres only permits IMMUTABLE expressions inside an index, and a GiST
--  exclusion constraint builds an index.
--
--  Prisma maps `DateTime` to `timestamp(3)` WITHOUT time zone. Calling
--  `tstzrange` on those columns forces an implicit `timestamp -> timestamptz`
--  cast, and that cast is only STABLE — its result depends on the session
--  TimeZone setting. Postgres refuses it:
--
--      ERROR: functions in index expression must be marked IMMUTABLE
--
--  `tsrange` over `timestamp` columns has no cast and is immutable, so it is
--  accepted. This is correct rather than merely convenient, because the
--  application only ever writes UTC instants — see the note at the top of
--  schema.prisma. Every row sits in one reference frame, so range overlap is
--  exactly right.
--
--  If the columns are ever changed to `@db.Timestamptz(3)`, this constraint
--  must become `tstzrange` in the SAME migration. They are one decision.
-- ===========================================================================

-- Lets a single GiST index mix an equality predicate (barberId) with a range
-- predicate (the time span).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
ADD CONSTRAINT "prevent_overlapping_appointments"
EXCLUDE USING gist (
  "barberId" WITH =,
  tsrange("startAt", "endAt", '[)') WITH &&
)
WHERE (status IN ('HELD', 'PENDING', 'CONFIRMED'));

-- Violations surface as SQLSTATE 23P01 (exclusion_violation), which the API
-- maps to HTTP 409 SLOT_TAKEN. See src/lib/errors.js.

-- ---------------------------------------------------------------------------
-- Hot-path partial indexes: the sweeper's "what has timed out?" and the
-- availability engine's "what is blocking this range?".
-- ---------------------------------------------------------------------------

CREATE INDEX "appointment_live_holds_idx"
  ON "Appointment" ("holdExpiresAt")
  WHERE "status" = 'HELD';

CREATE INDEX "appointment_blocking_range_idx"
  ON "Appointment" ("barberId", "startAt", "endAt")
  WHERE "status" IN ('HELD', 'PENDING', 'CONFIRMED');

CREATE INDEX "slot_offer_live_idx"
  ON "SlotOffer" ("expiresAt")
  WHERE "status" = 'SENT';

-- One live offer per waitlist entry. The HELD appointment already stops two
-- people being offered the same slot; this stops one person being offered two.
CREATE UNIQUE INDEX "slot_offer_one_live_per_entry_idx"
  ON "SlotOffer" ("waitlistEntryId")
  WHERE "status" = 'SENT';

-- A client may sit in the queue only once per service at a time.
CREATE UNIQUE INDEX "waitlist_one_active_per_service_idx"
  ON "WaitlistEntry" ("clientId", "serviceId")
  WHERE "status" IN ('ACTIVE', 'OFFERED');

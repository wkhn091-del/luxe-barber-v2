# Architecture — Luxe Barber Platform

> Step 1 deliverable: system architecture, data model, and the Smart VIP Waitlist
> timeout logic. Step 2 (backend implementation) lives in `server/`.

---

## 1. Requirements recap

**Functional**

| # | Capability |
|---|---|
| F1 | Public booking of a service at a real available time. Payment = cash on site. |
| F2 | Dynamic schedule: weekly template + real-time exceptions (open extra window / block break). |
| F3 | Smart VIP Waitlist: sequential offering, 15-minute confirmation window, automatic cascade to the next person. |
| F4 | Flash Slots: one-tap broadcast of a last-minute gap to past clients (first-come-first-served). |
| F5 | Gallery management (before/after pairs). |
| F6 | Automated notifications over WhatsApp / SMS / email. |

**Non-functional**

- **Zero double-booking.** This is the single hardest guarantee and it drives most of the design.
- **Zero empty slots.** The waitlist must keep cascading without human involvement.
- Small scale: 1–5 barbers, ~50 appointments/day, ~500 waitlist entries. This is a *correctness* problem, not a throughput problem.
- Must survive a process restart mid-offer. A 15-minute timer held only in RAM is a bug.
- Deployable on Render (persistent container) or Vercel (serverless + cron).

---

## 2. High-level design

```
                     ┌──────────────────────────────────────────┐
                     │  React SPA (Vercel)                       │
                     │  public site · booking · offer page       │
                     │  admin dashboard (mobile-first)           │
                     └───────────────┬──────────────────────────┘
                                     │ HTTPS / JSON
                     ┌───────────────▼──────────────────────────┐
                     │  Express API  (Render web service)        │
                     │                                           │
                     │  routes/ ── public · admin · internal      │
                     │     │                                     │
                     │  services/                                │
                     │   ├── availability  (schedule → slots)    │
                     │   ├── booking       (create/cancel)       │
                     │   ├── schedule      (admin hours)         │
                     │   └── waitlist      ★ offer engine        │
                     │     │                                     │
                     │  notifications/ (outbox → provider)       │
                     │  jobs/sweeper   (every 30s)               │
                     └───────┬───────────────────────┬───────────┘
                             │                       │
                ┌────────────▼──────────┐   ┌────────▼─────────────┐
                │ PostgreSQL            │   │ Twilio / Meta Cloud  │
                │ source of truth AND   │   │ WhatsApp · SMS       │
                │ scheduler state       │   │ Brevo · email        │
                └───────────────────────┘   └──────────────────────┘
```

### Key decision: the database *is* the scheduler

The 15-minute timeout is stored as `slot_offers.expires_at` (a timestamp), never as a
`setTimeout`. Two mechanisms read it:

1. **Lazy expiry** — every code path that touches a slot (availability query, booking,
   confirmation) first calls `releaseExpiredHolds()`. An expired offer is therefore *already*
   dead the moment anyone looks at it, even if no worker has run.
2. **Active sweeper** — a 30-second job finds expired offers and cascades to the next
   candidate. This is what makes the offer move *forward* without a user request.

Consequence: crash the server at minute 7 of a 15-minute offer, redeploy at minute 20 —
the offer is correctly expired and the cascade fires on the next sweep. No state is lost.

**Trade-off:** up to 30s of latency before the cascade fires. Acceptable here.
If you later want instant cascade, add BullMQ + Redis delayed jobs *on top* — keep the
sweeper as the safety net, never as the only mechanism. The interface in
`services/waitlist.service.js` (`expireOffer(id)`) is already the job payload.

---

## 3. Data model

```
Barber ──< WorkingHoursRule        (weekly template, local minutes)
  │     ──< ScheduleException      (OPEN | BLOCK, absolute UTC range)
  │     ──< Service
  │     ──< Appointment >── Client
  │     ──< WaitlistEntry >── Client
  │           │
  │           └──< SlotOffer ──> Appointment (the HELD row)
  ├──< GalleryItem
  ├──< FlashBroadcast
  └──< NotificationLog             (transactional outbox)
```

### The central trick: a hold *is* an appointment

When the waitlist offers a slot, we do **not** invent a separate "reservation" concept.
We insert a real `Appointment` row with `status = HELD` and `hold_expires_at = now + 15min`.

Why this matters: a single Postgres exclusion constraint then protects every path at once —
public booking, admin booking, waitlist hold, flash slot — with no application-level
coordination.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
  ADD CONSTRAINT appointment_no_overlap
  EXCLUDE USING gist (
    "barberId"  WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" IN ('HELD', 'PENDING', 'CONFIRMED'));
```

Two concurrent requests for the same slot: one commits, the other gets SQL state `23P01`,
which the API translates to `409 SLOT_TAKEN`. Double-booking is now *structurally
impossible*, not merely unlikely. Flipping a row to `OFFER_EXPIRED` or `CANCELLED` drops it
out of the constraint and the slot is free again — atomically.

> This is the main reason the schema is PostgreSQL rather than MongoDB. Mongo has no
> exclusion constraints; you would need a unique index on a discretised slot key plus
> application retries, and slot-vs-duration overlap becomes your problem to enforce.

### Timezones

`timestamptz` everywhere, UTC in the API. `Barber.timezone` is an IANA name.
`WorkingHoursRule` stores **local minutes from midnight** (`startMinute: 540` = 09:00 local),
converted per-date with Luxon. DST shifts therefore never move opening hours.

---

## 4. State machines

### Appointment

```
           book()                    confirmOffer()
  (none) ────────────► CONFIRMED ◄──────────────┐
     │                    │                     │
     │ waitlist offer     │ cancel()            │
     ▼                    ▼                     │
   HELD ──────────────► CANCELLED               │
     │  expire / decline      │                 │
     └──► OFFER_EXPIRED       │ both emit ──────┘
                              ▼   slot.opened
                        COMPLETED · NO_SHOW  (admin / sweeper)
```

`HELD`, `PENDING` and `CONFIRMED` block the slot. Everything else releases it.

### SlotOffer

```
  SENT ──confirm──► CONFIRMED
   │  ├──decline──► DECLINED   ─┐
   │  └──timeout──► EXPIRED    ─┼──► cascade to next candidate
   └─────booked elsewhere─────► SUPERSEDED
```

### WaitlistEntry

```
  ACTIVE ──offered──► OFFERED ──confirm──► CONVERTED (terminal)
     ▲                   │
     └───miss/decline────┘  missedOffers += 1
                            missedOffers > MAX  ──► EXPIRED (terminal)
  user leaves / window passes ──► CANCELLED / EXPIRED
```

---

## 5. Smart VIP Waitlist — sequence

```
Cancellation                 API                    DB                  WhatsApp
     │                        │                      │                      │
     │ POST /appointments/:t/cancel                   │                      │
     ├───────────────────────►│  status = CANCELLED  │                      │
     │                        ├─────────────────────►│  (slot now free)     │
     │                        │  emit slot.opened     │                      │
     │                        │                      │                      │
     │              ┌─────────┴──── offerSlotToNextCandidate ─────────┐      │
     │              │ 1. pg_advisory_xact_lock(barberId, startAt)     │      │
     │              │ 2. releaseExpiredHolds()      ← lazy expiry     │      │
     │              │ 3. slot still free?           else abort        │      │
     │              │ 4. pick candidate: priority DESC, createdAt ASC │      │
     │              │    matching service · date window · weekday ·   │      │
     │              │    time-of-day; skip anyone already offered     │      │
     │              │    THIS slot                                    │      │
     │              │ 5. ttl = min(15min, slotStart - now - 10min)    │      │
     │              │    ttl < 2min → skip to next candidate          │      │
     │              │ 6. INSERT Appointment(HELD, holdExpiresAt)      │      │
     │              │ 7. INSERT SlotOffer(token, expiresAt)           │      │
     │              │ 8. WaitlistEntry → OFFERED                      │      │
     │              │ 9. INSERT NotificationLog(QUEUED)  ← outbox     │      │
     │              └─────────────── one transaction ─────────────────┘      │
     │                        │                      │                      │
     │                        │  dispatcher drains outbox ──────────────────►│
     │                        │                      │   "You're up. 15:00   │
     │                        │                      │    Thu. Confirm in    │
     │                        │                      │    15 min → /o/abc"   │
     │                        │                      │                      │
  ┌──┴── client confirms in time ──► POST /offers/abc/confirm                │
  │        HELD → CONFIRMED · offer → CONFIRMED · entry → CONVERTED          │
  │                                                                          │
  └──┬── silence for 15 min ──► sweeper (every 30s) → expireOffer()          │
     │     HELD → OFFER_EXPIRED · offer → EXPIRED · entry → ACTIVE           │
     │     missedOffers += 1 · then recurse to candidate #2 ─────────────────┘
```

**Guarantees**

- *Sequential*: only one `SENT` offer can exist per slot, because the `HELD` appointment
  behind it is protected by the exclusion constraint.
- *Fair*: `ORDER BY priority DESC, createdAt ASC` — FIFO with a VIP override.
- *No infinite loop*: each cascade excludes waitlist entries that already received an offer
  for this exact slot (`SlotOffer` history is the ledger), so the recursion is bounded by
  the number of matching candidates.
- *No pointless offers*: TTL shrinks as the slot approaches. A 16:00 slot at 15:55 gets no
  offer at all rather than one that expires after the appointment has started.

---

## 6. API surface

### Public

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/services` | Service menu (duration, price) |
| GET | `/api/availability?serviceId&from&to` | Bookable slots, grouped by local day |
| POST | `/api/appointments` | Book (cash on site → `CONFIRMED` immediately) |
| GET | `/api/appointments/:token` | Manage link sent by SMS |
| POST | `/api/appointments/:token/cancel` | Cancel → emits `slot.opened` |
| POST | `/api/waitlist` | Join the VIP waitlist |
| GET / DELETE | `/api/waitlist/:token` | View / leave |
| GET | `/api/offers/:token` | Offer + server-authoritative `secondsRemaining` |
| POST | `/api/offers/:token/confirm` | Claim the slot |
| POST | `/api/offers/:token/decline` | Release immediately → instant cascade |
| GET | `/api/gallery` | Published before/after pairs |

### Admin (`Authorization: Bearer <jwt>`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/auth/login` | Email + password → JWT |
| GET / PUT | `/api/admin/working-hours` | Weekly template |
| GET / POST / DELETE | `/api/admin/schedule-exceptions` | Open extra window · block break |
| GET | `/api/admin/appointments` | Agenda |
| PATCH | `/api/admin/appointments/:id` | Confirm · complete · no-show · cancel |
| GET | `/api/admin/waitlist` | Live queue with positions |
| POST | `/api/admin/waitlist/:id/promote` | Force an offer to a specific client |
| POST | `/api/admin/flash-slots` | Broadcast a gap to past clients |
| GET / POST / PATCH / DELETE | `/api/admin/gallery` | Before/after management |
| GET | `/api/admin/stats` | Fill rate, waitlist conversion, no-show rate |

### Internal

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/internal/sweep` | Header `x-cron-secret`. Runs the same tick as the in-process sweeper — this is the Vercel Cron entry point. |

**Opening an extra window is the interesting admin path.** `POST /schedule-exceptions`
with `kind: OPEN` doesn't just insert a row — it recomputes the newly-bookable slots and
runs the waitlist engine against each one. Tapping "open 14:00–16:00 Thursday" on a phone
can fire four WhatsApp offers before the barber puts the phone down.

---

## 7. Flash Slots vs. Waitlist

Deliberately different mechanics:

| | Smart VIP Waitlist | Flash Slots |
|---|---|---|
| Audience | People who *asked* to be queued | Past clients, opted in |
| Delivery | One person at a time | Broadcast |
| Slot state | `HELD` for that person | Not held — open race |
| Winner | The one who was offered | First to tap Book |
| Use | Cancellations, new hours | Genuine last-minute gaps |

Flash is capped (`FLASH_MAX_RECIPIENTS`, cooldown per client) so the barber can't burn
goodwill by blasting the same 300 people twice a day.

---

## 8. Notifications — transactional outbox

Rows are written to `NotificationLog` with `status = QUEUED` **inside the same transaction**
as the state change that caused them. A dispatcher drains the queue with retries and
exponential backoff.

Why: if you call Twilio inside the transaction and the transaction rolls back, you have
told a client they got a slot they don't have. If you call Twilio after commit and the
process dies, the offer sits silent for 15 minutes and then expires unseen. The outbox
removes both failure modes.

Provider is behind one interface (`notifications/providers.js`) — `console` in dev,
`twilio` for SMS + WhatsApp, `meta` for the WhatsApp Cloud API, and email goes through `server/src/services/mailer.js` (Brevo HTTP API, or SMTP).
Swapping is an env var.

---

## 9. Deployment

**Recommended:** API on Render (`render.yaml` included) + Postgres + SPA on Vercel.
A persistent container is the natural home for a 30-second sweeper.

**Vercel-only:** `vercel.json` maps the Express app to a serverless function. Serverless
containers freeze between requests, so set `ENABLE_SCHEDULER=false` and drive
`/api/internal/sweep` with Vercel Cron. Cron's minimum granularity is 1 minute, so the
worst-case cascade delay becomes ~60s instead of ~30s. Also use a pooled connection
string (Neon/Supabase pgBouncer) — serverless will otherwise exhaust Postgres connections.

---

## 10. What I'd revisit as this grows

| Trigger | Change |
|---|---|
| Cascade latency complaints | BullMQ + Redis delayed jobs; sweeper demoted to safety net |
| Multi-barber / multi-shop | Availability per resource; advisory lock key already includes `barberId` |
| Sweeper ticks overlapping | Postgres advisory lock around the whole tick (currently guarded by a simple in-process flag) |
| Notification volume | Dedicated worker process; `NotificationLog` already has the retry columns |
| No-shows | Deposit hold — the only reason you'd add a payment gateway |
| Availability query cost | Cache the expanded weekly template per barber-day; invalidate on exception write |

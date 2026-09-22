# Luxe Barber

Single-chair barbershop platform. Hebrew, RTL, a WebGL homepage, and a backend
whose whole purpose is that a cancelled slot refills itself within seconds.

```
luxe-barber/
├── server/      Express · Prisma · PostgreSQL — the booking + waitlist engine
├── client/      React · R3F · Tailwind · Framer Motion — Hebrew RTL, 3D-first
├── docs/        ARCHITECTURE.md — data model, state machines, waitlist sequence
└── previews/    3 standalone HTML demos, no build step
```

---

## Setup

Two terminals. No patching, no hand-run SQL.

```bash
# 1. Database + API
cd server
cp .env.example .env          # fill in DATABASE_URL and DIRECT_URL — both
npm install
npm run db:setup              # migrate deploy → generate → seed
npm run dev                   # http://localhost:4000

# 2. Frontend
cd ../client
cp .env.example .env          # can stay blank in dev; vite proxies /api
npm install
npm run dev                   # http://localhost:5173
```

Seeded admin: `owner@luxebarber.com` / `ChangeMe!2026`. Notifications default to
`NOTIFY_PROVIDER=console`, so every WhatsApp/SMS prints to stdout.

---

## The three bugs you hit, and how they are fixed here

### 1. Migrations hang forever on Supabase → `directUrl`

`server/prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled, port 6543 — runtime
  directUrl = env("DIRECT_URL")     // direct, port 5432 — migrations only
}
```

**Why it hangs without this.** Supabase's pooled connection runs pgBouncer in
*transaction* pooling mode. Prisma takes a **session-level advisory lock** to
serialise migrations, and transaction-mode pooling cannot hold session state —
so the lock can never be granted, and Prisma waits on it with no timeout.
Migrations need a real session; the application does not. Both URLs are in
`.env.example` with the Supabase host format spelled out.

### 2. `functions in index expression must be marked IMMUTABLE` → `tsrange`

Your diagnosis was right, and the exact SQL is in
`server/prisma/migrations/0_init/migration.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
ADD CONSTRAINT "prevent_overlapping_appointments"
EXCLUDE USING gist (
  "barberId" WITH =,
  tsrange("startAt", "endAt", '[)') WITH &&
)
WHERE (status IN ('HELD', 'PENDING', 'CONFIRMED'));
```

**Why `tstzrange` fails.** Prisma maps `DateTime` to `timestamp(3)` *without*
time zone. Calling `tstzrange` on those columns forces an implicit
`timestamp → timestamptz` cast, and that cast is only **STABLE** — its result
depends on the session `TimeZone`. Postgres refuses stable expressions inside an
index, and a GiST exclusion constraint builds an index. `tsrange` over
`timestamp` columns needs no cast and is immutable.

This is correct rather than merely convenient: the application only ever writes
UTC instants, so every row sits in one reference frame and range overlap is
exactly right. **The two are one decision** — if the columns ever become
`@db.Timestamptz(3)`, the constraint must become `tstzrange` in the same
migration. That warning is written at the top of `schema.prisma` and again above
the constraint.

### 3. `ERESOLVE` against React 18 → R3F pinned to 8.x

`client/package.json`:

```json
"@react-three/fiber": "^8.13.0",
"@react-three/drei": "^9.114.3",
"react": "^18.3.1"
```

There is a `//react-three-fiber` note at the top level of the file saying not to
bump it without moving React first. (The comment lives at the top level rather
than inside `dependencies` — npm parses every key in `dependencies` as a package
name and rejects `"//"` with `EINVALIDPACKAGENAME`.)

---

## What I verified before shipping this

I could not run `prisma migrate deploy` in my sandbox — `binaries.prisma.sh` is
blocked there — so I verified the database layer the way `migrate deploy` does,
by applying the SQL directly.

| Check | Result |
|---|---|
| `0_init/migration.sql` against **real PostgreSQL 16.15** | applies clean, 13 tables, 8 enums |
| The exclusion constraint exists and is correctly formed | `EXCLUDE USING gist ("barberId" WITH =, tsrange(…) WITH &&) WHERE (status = ANY …)` |
| Overlapping `CONFIRMED` booking | rejected, SQLSTATE 23P01 |
| Overlapping `HELD` waitlist hold | rejected, SQLSTATE 23P01 |
| Adjacent 15:50 after a 15:00–15:50 | accepted — the `'[)'` half-open range works |
| Cancel, then rebook the same slot | accepted — status flip releases the slot |
| `tstzrange` on the same columns | fails with `must be marked IMMUTABLE`, confirming the fix |
| `schema.prisma` vs the DDL | **no drift** across 13 models, 158 columns, 8 enums |
| `npm install` in `client/` | 212 packages, **no ERESOLVE** |
| `npm run build` | clean, 1006 modules |
| Every Tailwind token used, present in the built CSS | all 18 checked — Tailwind drops unknown classes silently |
| Every server `.js` file | parses |

Two expected warnings on build: the Ploni font files (see
`client/public/fonts/README.md`) and a chunk-size notice for three.js, which is
already split into its own chunk.

---

## The frontend

`BarberPole.jsx` and `barberPole.js` are gone. So are the old English homepage
components.

**`client/src/components/HeroScene.jsx`** — an armillary of precision optics: a
frosted glass shell with a molten metal core turning inside it, wrapped in
counter-rotating brushed steel rings and orbited by glass and bronze shards. It
leans toward the cursor and recedes as you scroll.

Nothing is downloaded — no HDR, no GLTF. The studio is built from
`<Lightformer>` rectangles and every object is procedural geometry.

Four things make it feel expensive rather than busy:

1. **Nothing is ever assigned.** Every reactive value goes through
   `THREE.MathUtils.damp()`, which converges at a wall-clock rate.
   `lerp(a, b, 0.1)` settles twice as fast on a 120 Hz iPhone as on a 60 Hz
   laptop; damping does not.
2. **The render loop never touches React.** Pointer and scroll live in a plain
   module object read inside `useFrame`. `useState` there would reconcile the
   tree at frame rate.
3. **Exactly one expensive material.** `MeshTransmissionMaterial` re-renders the
   scene into its own framebuffer *per material*. The shell gets it; the shards
   use three's built-in `meshPhysicalMaterial` transmission, which shares the
   renderer's single pass.
4. **`PerformanceMonitor` measures the real frame budget** and steps samples,
   resolution, shard count and shadows down before a frame is dropped —
   rather than sniffing the user agent.

**`client/src/pages/Home.jsx`** — fixed canvas at `z-0`, a normal scrolling
glassmorphic document at `z-10`. No scroll-hijacking: Hebrew needs real DOM for
the browser's bidi engine, and hijacking breaks Find-in-page and VoiceOver.

**`client/src/pages/OfferPage.jsx`** — the 15-minute countdown. The clock is the
server's: `secondsRemaining` becomes an absolute deadline once, then every tick
recomputes from `Date.now()`, and it re-syncs on `visibilitychange` and `focus`.
A locked phone stops timers dead, and this is the one screen where a stale
number costs someone their appointment.

### The Hebrew work that is easy to miss

**Bidi isolation** (`client/src/lib/bidi.jsx`) is the real job. Inside an RTL
paragraph, `09:00 – 13:00` is one run of neutral characters, so the browser lays
it out right-to-left and your user reads `13:00 – 09:00`. The DOM is correct;
the screen is wrong. Every numeral, price, time and range goes through `<Num>`,
`<Range>`, `<Price>` or `<Minutes>`.

Three more:

- `dir` and `lang` are on `<html>`, not a wrapper — the scrollbar side, caret
  movement in inputs and every `dir="auto"` descendant key off the root.
- **No wide-tracked uppercase eyebrows anywhere in the type scale.** Hebrew has
  no capitals; faking that luxury-web tell is instantly recognisable as an LTR
  design flipped afterwards. Hebrew also needs more leading and tracking at or
  below zero, which is why the scale in `tailwind.config.js` looks the way it
  does.
- Entrance animations mirror: content enters from the leading edge, which in RTL
  is the **right**, so `x` animates from positive to zero.

### One rule that fails silently

The scroll layer is `.pass-through` (`pointer-events: none`) and only controls
opt back in with `.catch`. Drop it and the overlay swallows every pointer event,
the 3D stops following the cursor, and nothing in the console tells you why.

---

## The admin dashboard is Hebrew now

Every screen — PIN pad, timeline, waitlist, services, gallery — is translated,
RTL, shekel-denominated, and on the warm palette. The `dir="ltr"` island that
used to wrap `/admin/*` is **gone**; leaving it in would now flip the barber's
own interface back to left-aligned.

Verified after the rewrite:

- **Zero legacy dark tokens** anywhere in `src/` — the aliases in
  `tailwind.config.js` are now unused by the app and can be deleted whenever you
  like.
- **Zero physical spacing properties.** Everything is `ps-`/`pe-`, `ms-`/`me-`,
  `text-start`/`text-end`, `border-s`, `start-`/`end-`. The only `text-right`
  left in the tree is inside the comment telling you to hunt for them.
- **All 40 colour utilities** used in source confirmed present in the built CSS.
- `npm run build` clean, 1005 modules.

### Three places RTL was deliberately NOT applied

Over-mirroring is its own bug, and these are the three that bite:

1. **The PIN keypad grid stays 1-2-3 left to right.** Phone dialers, ATMs and
   calculators are LTR in Israel exactly as everywhere else. Mirroring it would
   make the barber mistype their own code.
2. **The − and + steppers are not swapped.** Their meaning is arithmetic, not
   directional. "+" always adds, whichever side it sits on.
3. **The before/after slider's geometry is screen-space.** "לפני" stays left of
   the handle and "אחרי" right, because the slider reveals along the axis your
   thumb moves, not the axis you read.

Everything numeric goes through `<Num>` / `<Price>` from `lib/bidi.jsx` — the
timeline is almost entirely numbers sitting inside Hebrew, and un-isolated
`15:00` renders as `00:15`.

---

## Deployment

**Render** — `server/render.yaml` provisions the API plus Postgres. A persistent
container runs the 30-second waitlist sweeper in-process.

**Vercel** — `server/api/index.js` exports the Express app as a function.
Serverless containers freeze between requests, so set `ENABLE_SCHEDULER=false`
and let the cron in `server/vercel.json` drive `POST /api/internal/sweep`. Use
the pooled `DATABASE_URL` there or you will exhaust connections.

The client deploys to Vercel either way; point `VITE_API_URL` at the API origin.

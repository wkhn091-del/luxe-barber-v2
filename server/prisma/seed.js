/**
 * Seed a realistic shop so the waitlist cascade can be exercised end to end
 * without inventing data by hand.
 *
 *   npm run db:seed
 *
 * Then, to watch the engine work:
 *   1. GET  /api/availability?serviceId=...       → pick a slot
 *   2. POST /api/appointments                     → book it
 *   3. POST /api/appointments/:token/cancel       → frees it
 *   4. watch the logs: an offer goes to the first matching waitlist entry
 *   5. do nothing for 15 minutes (or set offerTtlMin=1 below)
 *      → the sweeper expires it and offers it to the next person
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();
const token = () => crypto.randomBytes(16).toString('base64url');

async function main() {
  const barber = await prisma.barber.upsert({
    where: { slug: 'luxe-barber' },
    update: {},
    create: {
      name: 'לוקסי',
      slug: 'luxe-barber',
      // Asia/Jerusalem, not Europe/Paris. The client falls back to this too,
      // but the DATA is the real fix: a stale Paris row shifts every displayed
      // time by an hour and puts someone in the chair late.
      timezone: 'Asia/Jerusalem',
      addressLine: 'רחוב לילינבלום 24, תל אביב',
      phone: '+97230000000',
      instagramUrl: 'https://instagram.com/luxebarber',
      slotGranularityMin: 15,
      bufferMin: 5,
      minLeadTimeMin: 60,
      // Drop to 1 while testing so you don't wait a quarter of an hour to watch
      // the cascade fire.
      offerTtlMin: 15,
    },
  });

  await prisma.adminUser.upsert({
    where: { email: 'owner@luxebarber.com' },
    update: {},
    create: {
      barberId: barber.id,
      email: 'owner@luxebarber.com',
      passwordHash: await bcrypt.hash('ChangeMe!2026', 12),
      role: 'OWNER',
    },
  });

  // Hebrew names, shekel prices. `currency: 'ILS'` matters — the client forces
  // shekels when rendering, but that guard exists for legacy rows; new data
  // should never need it.
  const serviceData = [
    { name: 'תספורת גבר', description: 'ייעוץ, תספורת, שמפו וסידור', durationMin: 45, priceCents: 18000, currency: 'ILS', sortOrder: 1 },
    { name: 'תספורת וזקן', description: 'טיפול מלא כולל גילוח בתער', durationMin: 60, priceCents: 25000, currency: 'ILS', sortOrder: 2 },
    { name: 'עיצוב זקן', description: 'קונטור, עיצוב וסיום במגבת חמה', durationMin: 30, priceCents: 12000, currency: 'ILS', sortOrder: 3 },
    { name: 'תספורת מכונה', description: 'מכונה בלבד, בלי חפיפה', durationMin: 20, priceCents: 9000, currency: 'ILS', sortOrder: 4 },
  ];

  const services = [];
  for (const s of serviceData) {
    const existing = await prisma.service.findFirst({ where: { barberId: barber.id, name: s.name } });
    services.push(
      existing ?? (await prisma.service.create({ data: { ...s, barberId: barber.id } }))
    );
  }

  // The ISRAELI week. Sunday to Thursday full days, Friday morning only,
  // closed Saturday. Weekday numbers stay ISO-8601 (1 = Monday, 7 = Sunday)
  // because that is what the availability engine expects — only the SET of
  // days changes, not the numbering.
  //
  // Two rules per day rather than one with a hole: that is how the lunch break
  // is expressed, and it is why a 45-minute cut can never straddle it.
  const FULL_DAYS = [7, 1, 2, 3, 4]; // Sun, Mon, Tue, Wed, Thu
  await prisma.workingHoursRule.deleteMany({ where: { barberId: barber.id } });
  await prisma.workingHoursRule.createMany({
    data: [
      ...FULL_DAYS.flatMap((weekday) => [
        { barberId: barber.id, weekday, startMinute: 9 * 60, endMinute: 13 * 60 },
        { barberId: barber.id, weekday, startMinute: 14 * 60, endMinute: 19 * 60 },
      ]),
      // Friday: 09:00–14:00 straight through, closing before Shabbat.
      { barberId: barber.id, weekday: 5, startMinute: 9 * 60, endMinute: 14 * 60 },
    ],
  });

  const clientData = [
    { name: 'איתי כהן', phone: '+972501111111', vip: true },
    { name: 'יונתן לוי', phone: '+972502222222' },
    { name: 'עומר בר', phone: '+972503333333' },
    { name: 'דניאל אזולאי', phone: '+972504444444' },
  ];

  const clients = [];
  for (const c of clientData) {
    clients.push(
      await prisma.client.upsert({
        where: { phone: c.phone },
        update: {},
        create: { ...c, marketingOptIn: true, locale: 'he' },
      })
    );
  }

  // A queue with a VIP at the front, so `priority DESC, createdAt ASC` is
  // visibly doing something.
  const from = new Date();
  const to = new Date(Date.now() + 21 * 24 * 3600_000);

  for (const [i, client] of clients.entries()) {
    const existing = await prisma.waitlistEntry.findFirst({
      where: { clientId: client.id, status: { in: ['ACTIVE', 'OFFERED'] } },
    });
    if (existing) continue;

    await prisma.waitlistEntry.create({
      data: {
        barberId: barber.id,
        clientId: client.id,
        serviceId: services[i % services.length].id,
        earliestDate: from,
        latestDate: to,
        weekdayMask: 127,
        timePref: 'ANY',
        priority: client.vip ? 100 : 0,
        manageToken: token(),
      },
    });
  }

  const gallery = [
    { beforeUrl: 'https://placehold.co/900x1200/1a1a1a/888?text=Before+01', afterUrl: 'https://placehold.co/900x1200/0d0d0d/C6A15B?text=After+01', caption: 'משיער מגודל לקרופ מעוצב', tags: ['fade', 'texture'] },
    { beforeUrl: 'https://placehold.co/900x1200/1a1a1a/888?text=Before+02', afterUrl: 'https://placehold.co/900x1200/0d0d0d/C6A15B?text=After+02', caption: 'פייד עד העור ועיצוב זקן', tags: ['skin-fade', 'beard'] },
    { beforeUrl: 'https://placehold.co/900x1200/1a1a1a/888?text=Before+03', afterUrl: 'https://placehold.co/900x1200/0d0d0d/C6A15B?text=After+03', caption: 'חלוקה קלאסית בצד', tags: ['classic'] },
  ];

  if ((await prisma.galleryItem.count({ where: { barberId: barber.id } })) === 0) {
    await prisma.galleryItem.createMany({
      data: gallery.map((g, i) => ({ ...g, barberId: barber.id, sortOrder: i + 1 })),
    });
  }

  console.log('Seed complete.');
  console.log(`  shop      : ${barber.name} (${barber.slug}) · ${barber.timezone}`);
  console.log(`  admin     : owner@luxebarber.com / ChangeMe!2026`);
  console.log(`  services  : ${services.length}`);
  console.log(`  waitlist  : ${clients.length} entries (איתי כהן is VIP, priority 100)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

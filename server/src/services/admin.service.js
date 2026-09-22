/**
 * The barber's housekeeping: deleting appointments and clients outright, and
 * the business details the public site shows.
 *
 * DELETE is not CANCEL. Cancelling (PATCH status) tells the client and offers
 * the time to the waitlist. Deleting is for cleaning up — test bookings, demo
 * data, a duplicate — so it sends nothing and triggers nothing.
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { badRequest, notFound } from '../lib/errors.js';

export async function deleteAppointment(barberId, id) {
  const appointment = await prisma.appointment.findFirst({ where: { id, barberId }, select: { id: true } });
  if (!appointment) throw notFound('Appointment not found');
  // A waitlist offer holding this slot goes with it (onDelete: Cascade).
  await prisma.appointment.delete({ where: { id } });
  return { deleted: true };
}

export async function listClients({ q = '', take = 200 } = {}) {
  const term = q.trim();
  const digits = term.replace(/\D/g, '').replace(/^0/, ''); // "050-12" matches +97250 12…
  const where = term
    ? {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      }
    : {};

  const rows = await prisma.client.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      vip: true,
      noShowCount: true,
      createdAt: true,
      _count: { select: { appointments: true, waitlistEntries: true } },
      appointments: { orderBy: { startAt: 'desc' }, take: 1, select: { startAt: true } },
    },
  });

  return {
    clients: rows.map(({ _count, appointments, ...client }) => ({
      ...client,
      appointmentCount: _count.appointments,
      waitlistCount: _count.waitlistEntries,
      lastVisitAt: appointments[0]?.startAt ?? null,
    })),
  };
}

/** A client and everything that hangs off them, in one transaction. */
export async function deleteClient(id) {
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, _count: { select: { appointments: true, waitlistEntries: true } } },
  });
  if (!client) throw notFound('Client not found');

  await prisma.$transaction([
    prisma.notificationLog.deleteMany({ where: { clientId: id } }),
    prisma.appointment.deleteMany({ where: { clientId: id } }), // their offers cascade
    prisma.waitlistEntry.deleteMany({ where: { clientId: id } }), // …and these too
    prisma.client.delete({ where: { id } }),
  ]);

  return { deleted: true, appointments: client._count.appointments, waitlist: client._count.waitlistEntries };
}

const SETTINGS = {
  name: true,
  phone: true,
  email: true,
  addressLine: true,
  wazeUrl: true,
  instagramUrl: true,
  vacationMode: true,
  vacationMessage: true,
};

export async function getSettings(barberId) {
  return { settings: await prisma.barber.findUnique({ where: { id: barberId }, select: SETTINGS }) };
}

/** Input is already shaped by settingsSchema. Empty strings clear a field. */
export async function updateSettings(barberId, input) {
  const data = {};
  const clear = (value) => (value === '' ? null : value);

  if (input.name !== undefined) data.name = input.name;
  if (input.addressLine !== undefined) data.addressLine = clear(input.addressLine);
  if (input.vacationMode !== undefined) data.vacationMode = input.vacationMode;
  if (input.vacationMessage !== undefined) data.vacationMessage = clear(input.vacationMessage);
  if (input.email !== undefined) data.email = clear(input.email);
  if (input.wazeUrl !== undefined) data.wazeUrl = clear(input.wazeUrl);
  if (input.instagramUrl !== undefined) data.instagramUrl = clear(input.instagramUrl);
  if (input.phone !== undefined) {
    if (input.phone === '') data.phone = null;
    else {
      const phone = parsePhoneNumberFromString(input.phone, env.DEFAULT_COUNTRY_CODE);
      if (!phone?.isValid()) throw badRequest('מספר הטלפון לא תקין');
      data.phone = phone.number; // E.164, like every other phone in the system
    }
  }

  return { settings: await prisma.barber.update({ where: { id: barberId }, data, select: SETTINGS }) };
}

/**
 * Message catalogue.
 *
 * Kept server-side and channel-agnostic: one template renders to SMS text,
 * WhatsApp body variables and an email subject/body. WhatsApp Business requires
 * *pre-approved* templates for business-initiated messages, so `metaTemplate`
 * names the approved template and `vars` is its ordered variable list.
 */
import { formatLocal } from '../lib/time.js';
import { env } from '../config/env.js';

const link = (path) => `${env.PUBLIC_APP_URL}${path}`;

export const TEMPLATES = {
  BOOKING_CONFIRMED: {
    metaTemplate: 'booking_confirmed',
    render: ({ client, barber, service, appointment }) => ({
      vars: [client.name, service.name, formatLocal(appointment.startAt, barber.timezone, client.locale)],
      text:
        `${client.name}, your appointment is confirmed.\n` +
        `${service.name} — ${formatLocal(appointment.startAt, barber.timezone, client.locale)}\n` +
        `Payment: cash on site.\n` +
        `Manage: ${link(`/b/${appointment.manageToken}`)}`,
      subject: `Booking confirmed — ${barber.name}`,
    }),
  },

  // The crucial one. Urgency is explicit, the deadline is absolute, and the
  // decline link exists so a polite "no" cascades instantly instead of burning
  // the full 15 minutes.
  WAITLIST_OFFER: {
    metaTemplate: 'waitlist_offer',
    render: ({ client, barber, service, offer, minutes }) => ({
      vars: [
        client.name,
        formatLocal(offer.slotStartAt, barber.timezone, client.locale),
        String(minutes),
      ],
      text:
        `${client.name} — a slot just opened.\n` +
        `${service.name}, ${formatLocal(offer.slotStartAt, barber.timezone, client.locale)}\n` +
        `It's held for you for ${minutes} minutes.\n` +
        `Confirm: ${link(`/o/${offer.token}`)}\n` +
        `Can't make it? ${link(`/o/${offer.token}?decline=1`)}`,
      subject: `A slot just opened — ${minutes} minutes to confirm`,
    }),
  },

  WAITLIST_OFFER_EXPIRED: {
    metaTemplate: 'waitlist_offer_expired',
    render: ({ client, barber, offer }) => ({
      vars: [client.name, formatLocal(offer.slotStartAt, barber.timezone, client.locale)],
      text:
        `${client.name}, the ${formatLocal(offer.slotStartAt, barber.timezone, client.locale)} ` +
        `slot went to the next person on the list. You're still queued — we'll message you on the next opening.`,
      subject: 'That slot has been passed on',
    }),
  },

  WAITLIST_JOINED: {
    metaTemplate: 'waitlist_joined',
    render: ({ client, service, position }) => ({
      vars: [client.name, service.name, String(position)],
      text:
        `${client.name}, you're on the VIP waitlist for ${service.name} — position ${position}.\n` +
        `If a slot opens we'll message you and hold it for 15 minutes.`,
      subject: "You're on the VIP waitlist",
    }),
  },

  REMINDER_24H: {
    metaTemplate: 'reminder_24h',
    render: ({ client, barber, appointment, service }) => ({
      vars: [client.name, formatLocal(appointment.startAt, barber.timezone, client.locale)],
      text:
        `See you tomorrow, ${client.name}. ${service.name} at ` +
        `${formatLocal(appointment.startAt, barber.timezone, client.locale)}.\n` +
        `Need to change it? ${link(`/b/${appointment.manageToken}`)}`,
      subject: 'Your appointment is tomorrow',
    }),
  },

  REMINDER_1H: {
    metaTemplate: 'reminder_2h',
    render: ({ client, barber, appointment }) => ({
      vars: [client.name, formatLocal(appointment.startAt, barber.timezone, client.locale)],
      text: `${client.name} — you're in an hour, at ${formatLocal(appointment.startAt, barber.timezone, client.locale)}. Cash on site.`,
      subject: 'See you in 2 hours',
    }),
  },

  APPOINTMENT_CANCELLED: {
    metaTemplate: 'appointment_cancelled',
    render: ({ client, barber, appointment }) => ({
      vars: [client.name, formatLocal(appointment.startAt, barber.timezone, client.locale)],
      text: `${client.name}, your ${formatLocal(appointment.startAt, barber.timezone, client.locale)} appointment is cancelled.`,
      subject: 'Appointment cancelled',
    }),
  },

  FLASH_SLOT: {
    metaTemplate: 'flash_slot',
    render: ({ client, barber, broadcast }) => ({
      vars: [client.name, formatLocal(broadcast.slotStartAt, barber.timezone, client.locale)],
      text:
        `${client.name} — last-minute opening at ` +
        `${formatLocal(broadcast.slotStartAt, barber.timezone, client.locale)}.\n` +
        `First to book takes it: ${link('/book')}`,
      subject: 'Last-minute slot available',
    }),
  },
};

export function renderTemplate(name, data) {
  const tpl = TEMPLATES[name];
  if (!tpl) throw new Error(`Unknown notification template: ${name}`);
  return { ...tpl.render(data), metaTemplate: tpl.metaTemplate };
}

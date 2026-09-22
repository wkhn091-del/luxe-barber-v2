import { z } from 'zod';

/**
 * What the barber may edit from the settings screen, and how it is checked.
 * Links are allowed only to the service they claim to be: a "Waze link" that
 * points anywhere else is refused, so the site can never be made to send
 * clients to a stranger's page.
 */
const onHost = (hosts, message) =>
  z
    .string()
    .trim()
    .max(500)
    .refine((value) => {
      if (value === '') return true;
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
      } catch {
        return false;
      }
    }, message);

export const settingsSchema = z
  .object({
    name: z.string().trim().min(2, 'שם העסק קצר מדי').max(80, 'שם העסק ארוך מדי').optional(),
    phone: z.string().trim().max(30).optional(),
    email: z.union([z.literal(''), z.string().trim().email('כתובת המייל לא תקינה').max(200)]).optional(),
    addressLine: z.string().trim().max(200, 'הכתובת ארוכה מדי').optional(),
    vacationMode: z.boolean().optional(),
    vacationMessage: z.string().trim().max(200, 'ההודעה ארוכה מדי (עד 200 תווים)').optional(),
    wazeUrl: onHost(['waze.com'], 'קישור Waze צריך להתחיל ב־https://waze.com').optional(),
    instagramUrl: onHost(['instagram.com'], 'קישור אינסטגרם צריך להתחיל ב־https://instagram.com').optional(),
  })
  .strict();

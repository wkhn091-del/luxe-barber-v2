/**
 * Centralised, validated configuration.
 * Fail fast at boot rather than at 2am when the first waitlist offer goes out.
 */
import 'dotenv/config';
import { z } from 'zod';

/**
 * Booleans read the way people write them. `z.coerce.boolean()` is
 * `Boolean(value)`, and Boolean('false') is TRUE — so ENABLE_SCHEDULER=false
 * used to start the scheduler anyway.
 */
const flag = (fallback) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === '') return fallback;
      if (typeof value === 'boolean') return value;
      return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
    },
    fallback === undefined ? z.boolean().optional() : z.boolean()
  );

/** `KEY=` (present but empty) means unset in a .env file, so treat it that way. */
const blank = (schema) => z.preprocess((value) => (value === '' ? undefined : value), schema);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),

    DATABASE_URL: z.string().url(),

    // Public base URL of the SPA. Used to build confirm/decline links in email.
    PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
    // The API's own public address, for links in emails (the Excel download).
    // Empty → Render's RENDER_EXTERNAL_URL, which it sets automatically.
    PUBLIC_API_URL: blank(z.string().url().optional()),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('12h'),

    // Shared secret for POST /api/internal/sweep (Vercel Cron / Render cron job).
    CRON_SECRET: z.string().min(16),

    // The in-process sweeper. Turn OFF on serverless, where the container
    // freezes between requests and a setInterval is meaningless.
    ENABLE_SCHEDULER: flag(true),
    SWEEP_INTERVAL_MS: z.coerce.number().default(30_000),

    // --- Phone channels -----------------------------------------------------
    // none | console → WhatsApp and SMS are sent BY HAND from the admin via
    //                  wa.me links. Free. (`console` is kept as an alias.)
    // twilio | meta  → automated and paid, if the budget ever appears.
    NOTIFY_PROVIDER: z.enum(['none', 'console', 'twilio', 'meta']).default('none'),
    TWILIO_ACCOUNT_SID: blank(z.string().optional()),
    TWILIO_AUTH_TOKEN: blank(z.string().optional()),
    TWILIO_SMS_FROM: blank(z.string().optional()),
    TWILIO_WHATSAPP_FROM: blank(z.string().optional()),
    META_WABA_PHONE_ID: blank(z.string().optional()),
    META_ACCESS_TOKEN: blank(z.string().optional()),

    // --- Email: the automated channel — Brevo's HTTP API, or SMTP -----------
    MAIL_TRANSPORT: z.enum(['brevo', 'smtp', 'preview', 'console']).default('console'),
    // Brevo → Settings → SMTP & API → API Keys. (Not the SMTP key.)
    BREVO_API_KEY: blank(z.string().optional()),
    SMTP_HOST: blank(z.string().default('smtp.gmail.com')),
    SMTP_PORT: blank(z.coerce.number().int().positive().default(465)),
    // Unset → derived from the port: 465 is TLS from the first byte, 587 upgrades.
    SMTP_SECURE: flag(undefined),
    SMTP_USER: blank(z.string().optional()),
    SMTP_PASS: blank(z.string().optional()),
    MAIL_FROM_NAME: blank(z.string().max(80).optional()),
    MAIL_FROM_ADDRESS: blank(z.string().email().optional()),
    MAIL_REPLY_TO: blank(z.string().email().optional()),
    // Where the barber's "new booking" alert goes. Empty → MAIL_FROM_ADDRESS.
    ADMIN_NOTIFY_EMAIL: blank(z.string().email().optional()),
    MAIL_PREVIEW_DIR: blank(z.string().default('.mail-preview')),

    // Region for phone normalisation (E.164). IL for Israel.
    DEFAULT_COUNTRY_CODE: z.string().length(2).default('IL'),
    FLASH_MAX_RECIPIENTS: z.coerce.number().default(150),
    FLASH_COOLDOWN_HOURS: z.coerce.number().default(72),
  })
  .superRefine((cfg, ctx) => {
    const need = (key, when) => {
      if (!cfg[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `required when ${when}` });
    };

    if (cfg.MAIL_TRANSPORT === 'brevo') {
      need('BREVO_API_KEY', 'MAIL_TRANSPORT=brevo');
      need('MAIL_FROM_ADDRESS', 'MAIL_TRANSPORT=brevo (the sender address you verified in Brevo)');
    }
    if (cfg.MAIL_TRANSPORT === 'smtp') {
      need('SMTP_USER', 'MAIL_TRANSPORT=smtp');
      need('SMTP_PASS', 'MAIL_TRANSPORT=smtp');
      if (cfg.SMTP_USER && !cfg.MAIL_FROM_ADDRESS && !z.string().email().safeParse(cfg.SMTP_USER).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MAIL_FROM_ADDRESS'],
          message: 'required when SMTP_USER is not itself an email address',
        });
      }
    }
    if (cfg.NOTIFY_PROVIDER === 'twilio') {
      need('TWILIO_ACCOUNT_SID', 'NOTIFY_PROVIDER=twilio');
      need('TWILIO_AUTH_TOKEN', 'NOTIFY_PROVIDER=twilio');
    }
    if (cfg.NOTIFY_PROVIDER === 'meta') {
      need('META_WABA_PHONE_ID', 'NOTIFY_PROVIDER=meta');
      need('META_ACCESS_TOKEN', 'NOTIFY_PROVIDER=meta');
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());

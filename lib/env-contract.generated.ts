// Generated from config/environment-contract.json. Do not edit directly.
import { z } from "zod";

export const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  APP_NAME: z.string().min(1),
  MARKETPLACE_PREVIEW_FIXTURES: z.enum(["true", "false"]).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  SYNTHETIC_MONITOR_SECRET: z.string().min(1).optional(),
  OPERATIONAL_ALERT_WEBHOOK_URL: z.string().url().optional(),
  OPERATIONAL_ALERT_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.enum(["development","staging","production"]).optional(),
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: z.string().regex(new RegExp("^(?:0(?:\\.\\d+)?|1(?:\\.0+)?)$")).optional(),
  NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: z.string().regex(new RegExp("^(?:0(?:\\.\\d+)?|1(?:\\.0+)?)$")).optional(),
  NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: z.string().regex(new RegExp("^(?:0(?:\\.\\d+)?|1(?:\\.0+)?)$")).optional(),
  SENTRY_ORG: z.string().min(1).optional(),
  SENTRY_PROJECT: z.string().min(1).optional(),
  SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  SUPPORT_EMAIL: z.string().email().optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

# Generated environment reference

This file is generated from `config/environment-contract.json`. Update the contract and run `npm run env:artifacts:write`.

| Key | Scope | Required | Secret | Source / purpose |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Runtime | Yes | No | Supabase project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Runtime | Yes | No | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Runtime | Yes | Yes | Supabase server key or local service-role key |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` | Runtime | No | No | Local Supabase Google OAuth client id |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` | Runtime | No | Yes | Local Supabase Google OAuth client secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Runtime | Yes | No | Stripe publishable key |
| `STRIPE_SECRET_KEY` | Runtime | Yes | Yes | Stripe server key |
| `STRIPE_WEBHOOK_SECRET` | Runtime | Yes | Yes | Stripe webhook signing key |
| `NEXT_PUBLIC_SITE_URL` | Runtime | Yes | No | Canonical public URL |
| `APP_NAME` | Runtime | Yes | No | Display name |
| `MARKETPLACE_PREVIEW_FIXTURES` | Runtime | No | No | Development and E2E-only fixture catalog flag; ignored in production |
| `CRON_SECRET` | Runtime | When `TARGET_ENV=production` | Yes | Bearer secret used by Vercel Cron to authenticate scheduled maintenance routes |
| `SYNTHETIC_MONITOR_SECRET` | Runtime | When `TARGET_ENV=production` | Yes | Bearer secret for authenticated synthetic operational probes |
| `OPERATIONAL_ALERT_WEBHOOK_URL` | Runtime | When `TARGET_ENV=production` | Yes | HTTPS destination for privacy-safe critical operational alerts |
| `OPERATIONAL_ALERT_WEBHOOK_SECRET` | Runtime | When `TARGET_ENV=production` | Yes | HMAC secret used to sign operational alert deliveries |
| `NEXT_PUBLIC_SENTRY_DSN` | Runtime | When `TARGET_ENV=production` | No | Public Sentry DSN used by browser, server, and edge SDKs |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Runtime | When `TARGET_ENV=production` | No | Stable Sentry environment name such as development, staging, or production |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Runtime | No | No | Fraction of performance traces captured by Sentry |
| `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE` | Runtime | No | No | Fraction of normal browser sessions captured by Sentry Replay |
| `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE` | Runtime | No | No | Fraction of browser sessions with errors captured by Sentry Replay |
| `SENTRY_ORG` | Runtime | When `TARGET_ENV=production` | No | Sentry organization slug used for source-map uploads |
| `SENTRY_PROJECT` | Runtime | When `TARGET_ENV=production` | No | Sentry project slug used for source-map uploads |
| `SENTRY_AUTH_TOKEN` | Runtime | When `TARGET_ENV=production` | Yes | Sentry organization token with project release and source-map upload access |
| `TARGET_ENV` | Deploy | Yes | No | Deployment environment |
| `GOOGLE_AUTH_ENABLED` | Deploy | Yes | No | Whether hosted Google authentication must be configured |
| `SUPABASE_ACCESS_TOKEN` | Deploy | No | Yes | Supabase Management API and CLI access |
| `SUPABASE_DB_PASSWORD` | Deploy | No | Yes | Supabase database credential |
| `SUPABASE_PROJECT_REF` | Deploy | No | No | Supabase project reference |
| `GOOGLE_OAUTH_CLIENT_ID` | Deploy | When `GOOGLE_AUTH_ENABLED=true` | No | Hosted Google OAuth client id |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Deploy | When `GOOGLE_AUTH_ENABLED=true` | Yes | Hosted Google OAuth client secret |
| `STRIPE_WEBHOOK_ENDPOINT_ID` | Deploy | No | No | Managed Stripe webhook endpoint id |
| `STRIPE_WEBHOOK_ENABLED_EVENTS` | Deploy | No | No | Stripe webhook event override |
| `VERCEL_TOKEN` | Deploy | No | Yes | Vercel CLI access |
| `VERCEL_ORG_ID` | Deploy | No | No | Vercel user or team scope id |
| `VERCEL_PROJECT_ID` | Deploy | No | No | Vercel project id |
| `RESEND_API_KEY` | Runtime | No | Yes | Email provider key |
| `RESEND_FROM_EMAIL` | Runtime | No | No | Verified sender email |
| `SUPPORT_EMAIL` | Runtime | No | No | Support email |
| `TWILIO_ACCOUNT_SID` | Runtime | No | No | Twilio account id |
| `TWILIO_AUTH_TOKEN` | Runtime | No | Yes | Twilio authentication token |
| `TELEGRAM_BOT_TOKEN` | Runtime | No | Yes | Telegram bot token |
| `WHATSAPP_ACCESS_TOKEN` | Runtime | No | Yes | WhatsApp access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Runtime | No | No | WhatsApp phone number id |

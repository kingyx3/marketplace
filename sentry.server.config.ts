import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent, sentryEnvironment, sentrySampleRate } from "@/lib/sentry-config";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: sentryEnvironment(),
  sendDefaultPii: false,
  enableLogs: true,
  tracesSampleRate: sentrySampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, 0.1),
  beforeSend: scrubSentryEvent,
});

Sentry.setTag("service", "marketplace");
Sentry.setTag("runtime", "nodejs");

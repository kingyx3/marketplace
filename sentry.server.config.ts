import * as Sentry from "@sentry/nextjs";
import {
  defaultTraceSampleRate,
  parseSampleRate,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  sentryEnvironment,
  sentryRelease,
} from "@/lib/telemetry";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: sentryEnvironment(),
  release: sentryRelease(),
  tracesSampleRate: parseSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE ?? process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    defaultTraceSampleRate()
  ),
  enableLogs: true,
  dataCollection: { userInfo: false },
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: scrubSentryBreadcrumb,
});

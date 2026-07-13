import * as Sentry from "@sentry/nextjs";
import {
  defaultTraceSampleRate,
  parseSampleRate,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  sentryEnvironment,
} from "@/lib/telemetry";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: sentryEnvironment(),
  tracesSampleRate: parseSampleRate(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    defaultTraceSampleRate()
  ),
  replaysSessionSampleRate: parseSampleRate(
    process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
    0
  ),
  replaysOnErrorSampleRate: parseSampleRate(
    process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
    1
  ),
  enableLogs: true,
  dataCollection: { userInfo: false },
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: scrubSentryBreadcrumb,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

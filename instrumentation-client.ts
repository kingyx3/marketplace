import * as Sentry from "@sentry/nextjs";
import {
  defaultTraceSampleRate,
  parseSampleRate,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  sentryEnvironment,
} from "@/lib/telemetry";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const telemetryConsent = hasTelemetryConsent();

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: sentryEnvironment(),
  tracesSampleRate: telemetryConsent
    ? parseSampleRate(
        process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
        defaultTraceSampleRate()
      )
    : 0,
  replaysSessionSampleRate: telemetryConsent
    ? parseSampleRate(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE, 0)
    : 0,
  replaysOnErrorSampleRate: telemetryConsent
    ? parseSampleRate(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, 1)
    : 0,
  enableLogs: telemetryConsent,
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

function hasTelemetryConsent(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((entry) => {
    return entry.trim() === "marketplace_cookie_consent=analytics";
  });
}

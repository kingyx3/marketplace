/**
 * Provider-agnostic notification interface.
 *
 * The data model (`notifications` table) records every message we intend
 * to send; providers are thin adapters behind this interface. Providers
 * are feature-gated by the presence of their env keys — a missing key
 * means the channel is disabled, never a crash.
 *
 * Implementations are intentionally stubs in the scaffold; see
 * docs/build-plan.md for the rollout plan.
 */

export type NotificationChannel = "email" | "sms" | "telegram" | "whatsapp";

export interface NotificationMessage {
  channel: NotificationChannel;
  /** Customer id (uuid) the message belongs to, for audit/history. */
  customerId: string;
  /** Destination address: email address, E.164 phone, or chat id. */
  to: string;
  /** Template key, e.g. "preorder_confirmed", "balance_due", "shipped". */
  template: string;
  /** Template variables. */
  payload: Record<string, unknown>;
}

export interface NotificationProvider {
  channel: NotificationChannel;
  /** Whether this provider has the env keys it needs. */
  isConfigured(): boolean;
  send(message: NotificationMessage): Promise<{ ok: boolean; providerMessageId?: string; error?: string }>;
}

function stubProvider(channel: NotificationChannel, requiredEnvKeys: string[]): NotificationProvider {
  return {
    channel,
    isConfigured: () => requiredEnvKeys.every((k) => Boolean(process.env[k])),
    async send() {
      // TODO(build-plan): implement real delivery (Resend / Twilio /
      // Telegram Bot API / WhatsApp Cloud API). The scaffold only
      // records intent in the `notifications` table.
      return { ok: false, error: `${channel} provider not implemented in scaffold` };
    },
  };
}

export const providers: Record<NotificationChannel, NotificationProvider> = {
  email: stubProvider("email", ["RESEND_API_KEY"]),
  sms: stubProvider("sms", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]),
  telegram: stubProvider("telegram", ["TELEGRAM_BOT_TOKEN"]),
  whatsapp: stubProvider("whatsapp", ["WHATSAPP_ACCESS_TOKEN"]),
};

export function configuredChannels(): NotificationChannel[] {
  return (Object.keys(providers) as NotificationChannel[]).filter((c) =>
    providers[c].isConfigured()
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAppName } from "@/lib/app-config";
import { configuredChannels } from "@/lib/notifications";
import { createSecretClient } from "@/lib/supabase";

type CheckStatus = "ok" | "fail" | "disabled" | "configured";

interface EnvLike {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  HITPAY_API_KEY?: string;
  HITPAY_WEBHOOK_SALT?: string;
  HITPAY_API_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  APP_NAME?: string;
  [key: string]: string | undefined;
}

export interface HealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}

export interface ReadinessResponse {
  status: "ok" | "degraded";
  service: string;
  timestamp: string;
  checks: {
    supabase: { status: "ok" | "fail"; reason?: string };
    hitpay: {
      status: "ok" | "fail";
      apiKey: "configured" | "fail";
      webhookSalt: "configured" | "fail";
      apiUrl: "configured" | "fail";
    };
    notifications: {
      status: "ok";
      email: "configured" | "disabled";
      configuredChannels: string[];
    };
  };
}

export function shallowHealth(now = new Date(), env: EnvLike = process.env): HealthResponse {
  return {
    status: "ok",
    service: getAppName(env),
    timestamp: now.toISOString(),
  };
}

export async function collectReadiness(
  options: {
    env?: EnvLike;
    supabase?: SupabaseClient;
    now?: Date;
  } = {}
): Promise<ReadinessResponse> {
  const env = options.env ?? process.env;
  const supabase = await checkSupabase(env, options.supabase);
  const hitpay = checkHitPay(env);
  const notifications = checkNotifications(env);
  const status = supabase.status === "ok" && hitpay.status === "ok" ? "ok" : "degraded";

  return {
    status,
    service: getAppName(env),
    timestamp: (options.now ?? new Date()).toISOString(),
    checks: {
      supabase,
      hitpay,
      notifications,
    },
  };
}

async function checkSupabase(
  env: EnvLike,
  injectedClient?: SupabaseClient
): Promise<{ status: "ok" | "fail"; reason?: string }> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    return { status: "fail", reason: "missing_config" };
  }

  try {
    const client = injectedClient ?? createSecretClient();
    const { error } = await client
      .from("products")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if (error) {
      return { status: "fail", reason: "query_failed" };
    }
    return { status: "ok" };
  } catch {
    return { status: "fail", reason: "client_error" };
  }
}

function checkHitPay(env: EnvLike): ReadinessResponse["checks"]["hitpay"] {
  const apiKey: CheckStatus = env.HITPAY_API_KEY?.trim() ? "configured" : "fail";
  const webhookSalt: CheckStatus = env.HITPAY_WEBHOOK_SALT?.trim() ? "configured" : "fail";
  const apiUrl: CheckStatus = isHttpsUrl(env.HITPAY_API_URL) ? "configured" : "fail";

  return {
    status:
      apiKey === "configured" && webhookSalt === "configured" && apiUrl === "configured"
        ? "ok"
        : "fail",
    apiKey,
    webhookSalt,
    apiUrl,
  };
}

function isHttpsUrl(value: string | undefined): boolean {
  try {
    return Boolean(value && new URL(value).protocol === "https:");
  } catch {
    return false;
  }
}

function checkNotifications(env: EnvLike): ReadinessResponse["checks"]["notifications"] {
  const channels = configuredChannels(env);
  return {
    status: "ok",
    email: channels.includes("email") ? "configured" : "disabled",
    configuredChannels: channels,
  };
}

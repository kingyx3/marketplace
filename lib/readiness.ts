import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppName } from "@/lib/app-config";
import { configuredChannels } from "@/lib/notifications";
import { createServiceClient } from "@/lib/supabase";

type CheckStatus = "ok" | "fail" | "disabled" | "configured";

interface EnvLike {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
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
    stripe: {
      status: "ok" | "fail";
      secretKey: "configured" | "fail";
      webhookSecret: "configured" | "fail";
    };
    notifications: {
      status: "ok";
      email: "configured" | "disabled";
      configuredChannels: string[];
    };
  };
}

export function shallowHealth(now = new Date()): HealthResponse {
  return {
    status: "ok",
    service: getAppName(),
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
  const stripe = checkStripe(env);
  const notifications = checkNotifications(env);
  const status = supabase.status === "ok" && stripe.status === "ok" ? "ok" : "degraded";

  return {
    status,
    service: getAppName(env),
    timestamp: (options.now ?? new Date()).toISOString(),
    checks: {
      supabase,
      stripe,
      notifications,
    },
  };
}

async function checkSupabase(
  env: EnvLike,
  injectedClient?: SupabaseClient
): Promise<{ status: "ok" | "fail"; reason?: string }> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { status: "fail", reason: "missing_config" };
  }

  try {
    const client = injectedClient ?? createServiceClient();
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

function checkStripe(env: EnvLike): ReadinessResponse["checks"]["stripe"] {
  const secretKey: CheckStatus = env.STRIPE_SECRET_KEY?.startsWith("sk_") ? "configured" : "fail";
  const webhookSecret: CheckStatus = env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")
    ? "configured"
    : "fail";

  return {
    status: secretKey === "configured" && webhookSecret === "configured" ? "ok" : "fail",
    secretKey,
    webhookSecret,
  };
}

function checkNotifications(env: EnvLike): ReadinessResponse["checks"]["notifications"] {
  const channels = configuredChannels(env);
  return {
    status: "ok",
    email: channels.includes("email") ? "configured" : "disabled",
    configuredChannels: channels,
  };
}

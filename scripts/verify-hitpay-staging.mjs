#!/usr/bin/env node
import { buildHitPayWebhookConfig, verifyHitPayWebhook } from "./lib/hitpay-webhook.mjs";

const config = buildHitPayWebhookConfig(process.env);
if (!config.apiKey || !process.env.HITPAY_WEBHOOK_SALT || !config.siteUrl) {
  throw new Error("HITPAY_API_KEY, HITPAY_WEBHOOK_SALT, and NEXT_PUBLIC_SITE_URL are required");
}
if (process.env.TARGET_ENV !== "production" && !config.apiUrl.includes("sandbox.hit-pay.com")) {
  throw new Error("Non-production environments must use the HitPay sandbox API URL");
}
if (process.env.TARGET_ENV === "production" && config.apiUrl.includes("sandbox.hit-pay.com")) {
  throw new Error("Production must use the HitPay production API URL");
}
await verifyHitPayWebhook(config);
console.log(`HitPay ${process.env.TARGET_ENV || "hosted"} configuration verified.`);

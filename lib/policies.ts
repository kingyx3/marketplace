import { getAppName } from "@/lib/app-config";

export const POLICY_EFFECTIVE_DATE = "16 July 2026";

export function getPolicyOperatorName(): string {
  return getAppName();
}

export function getSupportEmail(): string | null {
  const value = process.env.SUPPORT_EMAIL?.trim().toLowerCase();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

type AlertChannel = "email" | "telegram" | "whatsapp";

interface ApiErrorResponse {
  error?: {
    message?: string;
  };
}

export function WaitlistSignupPanel({
  authRedirectPath,
  inStock,
  skuId,
  supabaseAnonKey,
  supabaseUrl,
}: {
  authRedirectPath: string;
  inStock: boolean;
  skuId: string;
  supabaseAnonKey: string;
  supabaseUrl: string;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<AlertChannel>("email");
  const [contact, setContact] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = useMemo(
    () =>
      supabaseUrl && supabaseAnonKey ? createBrowserClient(supabaseUrl, supabaseAnonKey) : null,
    [supabaseUrl, supabaseAnonKey]
  );

  async function accessToken(): Promise<string> {
    if (!supabase) {
      throw new Error("Authentication is not configured");
    }

    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      router.push(`/sign-in?next=${encodeURIComponent(authRedirectPath)}`);
      throw new Error("Sign in is required before joining drop alerts");
    }
    return data.session.access_token;
  }

  async function joinWaitlist() {
    if (saving) return;
    setSaving(true);
    setMessage(null);

    try {
      const token = await accessToken();
      const response = await fetch("/api/waitlist", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          skuId,
          channel,
          contact: channel === "email" ? undefined : contact,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiErrorResponse;
      if (response.status === 401) {
        router.push(`/sign-in?next=${encodeURIComponent(authRedirectPath)}`);
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Drop alert could not be saved");
      }
      setMessage("Drop alert saved");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Drop alert could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div>
        <p className="text-sm font-semibold text-zinc-950">Drop alerts</p>
        <p className="mt-1 text-xs text-zinc-500">
          {inStock ? "Get the next restock alert." : "Get notified when this SKU is available."}
        </p>
      </div>
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        Channel
        <select
          className="min-h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm"
          disabled={saving}
          onChange={(event) => {
            setChannel(event.target.value as AlertChannel);
            setContact("");
            setMessage(null);
          }}
          value={channel}
        >
          <option value="email">Email</option>
          <option value="telegram">Telegram</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </label>
      {channel !== "email" ? (
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          {channel === "telegram" ? "Telegram chat ID" : "WhatsApp number"}
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            disabled={saving}
            maxLength={128}
            onChange={(event) => setContact(event.target.value)}
            placeholder={channel === "telegram" ? "123456789" : "+6591234567"}
            value={contact}
          />
        </label>
      ) : null}
      <button
        className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-zinc-400"
        disabled={saving || (channel !== "email" && !contact.trim())}
        onClick={joinWaitlist}
        type="button"
      >
        {saving ? "Saving alert" : "Save drop alert"}
      </button>
      {message ? <p className="text-sm text-zinc-600">{message}</p> : null}
    </div>
  );
}

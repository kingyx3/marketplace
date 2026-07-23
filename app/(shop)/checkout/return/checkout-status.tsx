"use client";

import { useEffect, useState } from "react";

import { StatusBadge } from "@/app/_components/status-badge";
import { checkoutReturnState } from "@/lib/checkout-return";

export function CheckoutStatus({
  orderId,
  providerStatus,
}: {
  orderId?: string;
  providerStatus?: string;
}) {
  const [status, setStatus] = useState(providerStatus);
  const state = checkoutReturnState(status);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/checkout/status?order=${encodeURIComponent(orderId)}`,
          {
            cache: "no-store",
          },
        );
        if (response.ok) {
          const body = (await response.json()) as { status?: string };
          if (!cancelled && body.status) setStatus(body.status);
          if (["paid", "failed"].includes(body.status ?? "")) return;
        }
      } catch {
        // Keep the non-authoritative pending state and retry with backoff.
      }
      attempts += 1;
      if (!cancelled && attempts < 8)
        timer = setTimeout(poll, Math.min(15_000, 1000 * 2 ** attempts));
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  return (
    <div className="space-y-3">
      <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">
          {state.title}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-zinc-600">
          {state.description}
        </p>
      </div>
    </div>
  );
}

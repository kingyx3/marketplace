"use client";

import { useState, useSyncExternalStore } from "react";

const CONSENT_COOKIE = "marketplace_cookie_consent";
const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

type ConsentChoice = "essential" | "analytics";
type ConsentSnapshot = ConsentChoice | "loading" | "missing";

export function CookiePreferences() {
  const storedChoice = useSyncExternalStore<ConsentSnapshot>(
    subscribeToCookie,
    readConsentCookie,
    () => "loading"
  );
  const [savedChoice, setSavedChoice] = useState<ConsentChoice | null>(null);
  const [editing, setEditing] = useState(false);
  const choice = savedChoice ?? (isConsentChoice(storedChoice) ? storedChoice : null);
  const open = storedChoice !== "loading" && (editing || choice === null);

  function save(nextChoice: ConsentChoice) {
    const shouldReload =
      choice !== nextChoice && (choice === "analytics" || nextChoice === "analytics");
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CONSENT_COOKIE}=${nextChoice}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    setSavedChoice(nextChoice);
    setEditing(false);

    if (shouldReload) {
      window.location.reload();
    }
  }

  if (storedChoice === "loading") return null;

  if (!open) {
    return (
      <button
        className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-950 hover:underline"
        onClick={() => setEditing(true)}
        type="button"
      >
        Cookie preferences
      </button>
    );
  }

  return (
    <aside
      aria-label="Cookie preferences"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-lg border border-zinc-300 bg-white p-5 shadow-xl"
    >
      <h2 className="text-lg font-semibold text-zinc-950">Choose your cookie preferences</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Essential cookies keep sign-in, security, and your cart working. With your permission, we
        also use privacy-scrubbed performance monitoring and error replay to improve reliability.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          onClick={() => save("analytics")}
          type="button"
        >
          Allow analytics
        </button>
        <button
          className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
          onClick={() => save("essential")}
          type="button"
        >
          Essential only
        </button>
        {choice ? (
          <button
            className="min-h-11 px-2 text-sm font-medium text-zinc-600 hover:text-zinc-950"
            onClick={() => setEditing(false)}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function readConsentCookie(): ConsentSnapshot {
  const value = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${CONSENT_COOKIE}=`))
    ?.split("=", 2)[1];

  return value === "analytics" || value === "essential" ? value : "missing";
}

function isConsentChoice(value: ConsentSnapshot): value is ConsentChoice {
  return value === "analytics" || value === "essential";
}

function subscribeToCookie() {
  return () => undefined;
}

"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [eventId, setEventId] = useState("");

  useEffect(() => {
    setEventId(Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          alignItems: "center",
          background: "#fafafa",
          color: "#18181b",
          display: "flex",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          justifyContent: "center",
          margin: 0,
          minHeight: "100vh",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p style={{ color: "#047857", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.12em" }}>
            APPLICATION ERROR
          </p>
          <h1 style={{ fontSize: "2rem", margin: "0.75rem 0" }}>This page could not load</h1>
          <p style={{ color: "#52525b", lineHeight: 1.6 }}>
            The failure has been recorded. Reload the page, or share the reference below with support if it continues.
          </p>
          {eventId ? (
            <p style={{ color: "#71717a", fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}>
              Reference: {eventId}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#18181b",
              border: 0,
              borderRadius: "9999px",
              color: "white",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
              marginTop: "1rem",
              padding: "0.75rem 1.25rem",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}

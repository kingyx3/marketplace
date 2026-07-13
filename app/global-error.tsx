"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: "app.global-error" },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main>
          <h1>Something went wrong</h1>
          <p>Reload the page and try again. Support can use the error reference to investigate.</p>
          {error.digest ? <p>Error reference: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}

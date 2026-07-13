"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export function SentryUserContext({ userId }: { userId?: string }) {
  useEffect(() => {
    Sentry.setUser(userId ? { id: userId } : null);
    return () => Sentry.setUser(null);
  }, [userId]);

  return null;
}

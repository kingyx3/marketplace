import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/app/_components/app-shell";
import { getAppName } from "@/lib/app-config";
import { getCurrentViewer } from "@/lib/auth";

import "./globals.css";

const appName = getAppName();
const siteUrl = safeUrl(process.env.NEXT_PUBLIC_SITE_URL);

export const metadata: Metadata = {
  title: {
    default: `${appName} | TCG Booster Boxes`,
    template: `%s | ${appName}`,
  },
  description: "Sealed TCG products, preorders, limited-time deals, and retail checkout.",
  metadataBase: siteUrl,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const viewer = await getCurrentViewer();
  const appName = getAppName();

  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <AppShell appName={appName} viewer={viewer}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}

function safeUrl(value?: string): URL | undefined {
  if (!value) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

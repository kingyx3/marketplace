import type { Metadata } from "next";

import { SiteFooter } from "@/app/_components/site-footer";
import { SiteHeader } from "@/app/_components/site-header";
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
  description:
    "Sealed TCG booster boxes for players, collectors, and retailers. B2C, wholesale, and pre-orders.",
  metadataBase: siteUrl,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getCurrentViewer();
  const appName = getAppName();

  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <SiteHeader appName={appName} viewer={viewer} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">{children}</main>
        <SiteFooter appName={appName} />
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

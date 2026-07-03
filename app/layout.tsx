import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marketplace — TCG Booster Boxes",
  description:
    "Sealed TCG booster boxes for players, collectors, and retailers. B2C, wholesale, and pre-orders.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              marketplace
            </Link>
            <nav className="flex gap-6 text-sm text-zinc-600">
              <Link href="/catalog" className="hover:text-zinc-900">
                Catalog
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}

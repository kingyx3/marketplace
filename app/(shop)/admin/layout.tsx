import type { Metadata } from "next";

import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireStaff("/admin");
  return children;
}

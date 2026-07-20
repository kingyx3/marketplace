import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ControlShell } from "@/app/(shop)/control/_components/control-shell";
import { requireControlPermission } from "@/lib/control-access";

export const metadata: Metadata = {
  title: "Control",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ControlLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal?: ReactNode;
}) {
  const { staff } = await requireControlPermission("control.view", "/control");
  return (
    <>
      <ControlShell staff={staff}>{children}</ControlShell>
      {modal}
    </>
  );
}

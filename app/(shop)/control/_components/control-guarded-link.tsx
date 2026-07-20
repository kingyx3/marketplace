"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ComponentPropsWithoutRef, type MouseEvent } from "react";

import { ControlConfirmDialog } from "@/app/(shop)/control/_components/control-confirm-dialog";

export function ControlGuardedLink({
  children,
  href,
  ...props
}: Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & { href: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (!document.querySelector('form[data-admin-form="true"][data-dirty="true"]')) return;
    event.preventDefault();
    setConfirming(true);
  }

  return (
    <>
      <Link {...props} href={href} onClick={follow}>
        {children}
      </Link>
      <ControlConfirmDialog
        confirmLabel="Discard changes"
        description="Your unsaved entries will be lost when you leave this page."
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          document
            .querySelectorAll<HTMLFormElement>('form[data-admin-form="true"]')
            .forEach((form) => {
              form.dataset.dirty = "false";
            });
          setConfirming(false);
          router.push(href);
        }}
        open={confirming}
        title="Discard unsaved changes?"
        tone="danger"
      />
    </>
  );
}

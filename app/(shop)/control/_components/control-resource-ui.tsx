import Link from "next/link";

import {
  AdminActionForm,
  AdminSubmitButton,
} from "@/app/(shop)/control/_components/admin-action-form";
import { ControlGuardedLink } from "@/app/(shop)/control/_components/control-guarded-link";

export { AdminActionForm as ControlActionForm };

export function ControlPrimaryLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}

export function ControlBackLink({
  href,
  children = "Back to list",
}: {
  href: string;
  children?: React.ReactNode;
}) {
  return (
    <ControlGuardedLink
      className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
      href={href}
    >
      {children}
    </ControlGuardedLink>
  );
}

export function ControlEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid justify-items-start gap-3 rounded-xl border border-dashed border-zinc-300 bg-white p-8">
      <h2 className="font-semibold text-zinc-950">{title}</h2>
      <p className="max-w-2xl text-sm leading-6 text-zinc-600">{description}</p>
      {action}
    </div>
  );
}

export function ControlData({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

export function ControlSaveButton({
  children,
  pendingLabel = "Saving…",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
}) {
  return (
    <AdminSubmitButton
      className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      pendingLabel={pendingLabel}
    >
      {children}
    </AdminSubmitButton>
  );
}

export function ControlDangerButton({
  children,
  pendingLabel = "Working…",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
}) {
  return (
    <AdminSubmitButton
      className="min-h-11 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      pendingLabel={pendingLabel}
    >
      {children}
    </AdminSubmitButton>
  );
}

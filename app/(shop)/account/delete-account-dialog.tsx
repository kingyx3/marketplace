"use client";

import { useRef } from "react";

import { deleteAccount } from "@/app/actions/account";

export function DeleteAccountDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        className="mx-auto inline-flex min-h-11 w-full items-center justify-center rounded-md bg-rose-700 px-5 text-center text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 sm:w-auto sm:min-w-56"
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        Delete account
      </button>

      <dialog
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-description"
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl border border-zinc-200 bg-white p-0 text-zinc-950 shadow-2xl backdrop:bg-zinc-950/70 backdrop:backdrop-blur-sm"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
        ref={dialogRef}
      >
        <div className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Danger zone</p>
          <h2 className="mt-2 text-2xl font-bold" id="delete-account-title">
            Delete your account?
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600" id="delete-account-description">
            You will be signed out and lose access to this account. Order and payment records are
            retained where required for fulfilment, refunds, fraud prevention, and legal
            obligations.
          </p>

          <form action={deleteAccount} className="mt-6 grid gap-3 sm:grid-cols-2">
            <input name="confirmDeletion" type="hidden" value="yes" />
            <button
              autoFocus
              className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500 hover:bg-zinc-50"
              onClick={closeDialog}
              type="button"
            >
              Keep account
            </button>
            <button className="min-h-11 rounded-md bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800">
              Yes, delete account
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}

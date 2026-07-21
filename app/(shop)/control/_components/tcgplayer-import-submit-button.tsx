"use client";

import { useFormStatus } from "react-dom";

export function ImportSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-11 rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      disabled={pending}
    >
      {pending ? "Importing product and SKUs…" : "Import product and SKUs"}
    </button>
  );
}

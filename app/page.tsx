import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Sealed TCG booster boxes</h1>
      <p className="max-w-2xl text-zinc-600">
        B2C retail, B2B wholesale, and pre-orders for Magic: The Gathering, Pokémon, One Piece,
        Lorcana, and more. This is the deployment scaffold — see{" "}
        <code className="rounded bg-zinc-100 px-1">docs/build-plan.md</code> for what ships next.
      </p>
      <Link
        href="/catalog"
        className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Browse catalog
      </Link>
    </div>
  );
}

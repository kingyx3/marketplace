import { createAnonClient } from "@/lib/supabase";
import { hasSupabasePublicEnv } from "@/lib/env";

// Always render at request time: the catalog reads live inventory and
// must not be frozen into the build (and must build without DB creds).
export const dynamic = "force-dynamic";

interface CatalogRow {
  id: string;
  name: string;
  slug: string;
  product_type: string;
  sets_releases: { name: string; code: string } | null;
  tcg_categories: { name: string } | null;
}

async function fetchProducts(): Promise<CatalogRow[] | null> {
  if (!hasSupabasePublicEnv()) return null;
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, product_type, sets_releases(name, code), tcg_categories(name)")
    .eq("active", true)
    .order("name")
    .limit(50);
  if (error) {
    console.error("catalog query failed:", error.message);
    return null;
  }
  return data as unknown as CatalogRow[];
}

export default async function CatalogPage() {
  const products = await fetchProducts();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Catalog</h1>
      {products === null ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Database not configured or unreachable. Set{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see{" "}
          <code>docs/local-dev.md</code>).
        </p>
      ) : products.length === 0 ? (
        <p className="text-zinc-600">No active products yet. Run the seed: see docs/local-dev.md.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-zinc-500">
                  {p.tcg_categories?.name}
                  {p.sets_releases ? ` · ${p.sets_releases.name} (${p.sets_releases.code})` : ""}
                </p>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600">
                {p.product_type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

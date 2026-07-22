-- Forward repair for environments that applied the product-only cutover before
-- its storefront policies were rebound to the new product inventory model.

begin;

drop policy if exists "catalog readable" on public.products;
create policy "catalog readable" on public.products
  for select
  to anon, authenticated
  using (
    active
    and exists (
      select 1
      from public.listing_items listing
      where listing.product_id = products.id
        and listing.published
    )
  );

drop policy if exists "availability readable" on public.product_inventory;
create policy "availability readable" on public.product_inventory
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products product
      join public.listing_items listing on listing.product_id = product.id
      where product.id = product_inventory.product_id
        and product.active
        and listing.published
    )
  );

grant select on table public.product_inventory to anon, authenticated;

commit;

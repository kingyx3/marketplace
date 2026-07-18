-- Keep incomplete catalog products out of the storefront until they have a sellable SKU.

begin;

create index idx_skus_sellable_variant
  on public.booster_box_skus(product_variant_id)
  where active and price_cents > 0;

drop policy "catalog readable" on public.products;
create policy "catalog readable" on public.products
  for select
  to anon, authenticated
  using (
    active
    and exists (
      select 1
      from public.product_variants variant
      join public.booster_box_skus sku
        on sku.product_variant_id = variant.id
      where variant.product_id = products.id
        and sku.active
        and sku.price_cents > 0
    )
  );

alter table public.listing_items
  alter column published set default false;

create or replace function public.create_default_listing_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.listing_items (product_id, published)
  values (new.id, false);

  return new;
end;
$$;

update public.listing_items listing
set published = false
where listing.published
  and not exists (
    select 1
    from public.product_variants variant
    join public.booster_box_skus sku
      on sku.product_variant_id = variant.id
    where variant.product_id = listing.product_id
      and sku.active
      and sku.price_cents > 0
  );

create function public.enforce_listing_sellable_sku()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.published
     and not exists (
       select 1
       from public.product_variants variant
       join public.booster_box_skus sku
         on sku.product_variant_id = variant.id
       where variant.product_id = new.product_id
         and sku.active
         and sku.price_cents > 0
     ) then
    raise exception 'product requires an active SKU with a positive price before publication'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_listing_sellable_sku() from public, anon, authenticated;
grant execute on function public.enforce_listing_sellable_sku() to service_role;

create trigger enforce_listing_sellable_sku
  before insert or update of product_id, published on public.listing_items
  for each row execute function public.enforce_listing_sellable_sku();

create function public.unpublish_listing_without_sellable_sku()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new_variant_id uuid;
  v_old_variant_id uuid;
  v_product_id uuid;
begin
  if tg_op <> 'DELETE' then
    v_new_variant_id := new.product_variant_id;
  end if;

  if tg_op <> 'INSERT' then
    v_old_variant_id := old.product_variant_id;
  end if;

  for v_product_id in
    select distinct variant.product_id
    from public.product_variants variant
    where variant.id in (v_new_variant_id, v_old_variant_id)
  loop
    if not exists (
      select 1
      from public.product_variants product_variant
      join public.booster_box_skus sku
        on sku.product_variant_id = product_variant.id
      where product_variant.product_id = v_product_id
        and sku.active
        and sku.price_cents > 0
    ) then
      update public.listing_items
      set published = false
      where product_id = v_product_id
        and published;
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.unpublish_listing_without_sellable_sku() from public, anon, authenticated;
grant execute on function public.unpublish_listing_without_sellable_sku() to service_role;

create trigger unpublish_listing_without_sellable_sku
  after insert or update of product_variant_id, active, price_cents or delete on public.booster_box_skus
  for each row execute function public.unpublish_listing_without_sellable_sku();

commit;

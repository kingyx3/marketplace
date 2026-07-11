-- The current monetary contract calculates Singapore GST as tax included in
-- the checkout total. Reject non-Singapore shipping snapshots until a
-- jurisdiction-aware tax engine and migration path are implemented.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_shipping_country_sg'
  ) then
    alter table public.orders
      add constraint orders_shipping_country_sg
      check (
        shipping_address is null
        or upper(trim(coalesce(shipping_address->>'countryCode', ''))) = 'SG'
      );
  end if;
end $$;

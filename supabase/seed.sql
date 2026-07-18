-- Minimal retail seed for local `supabase db reset`.

insert into public.tcg_categories (slug, name, publisher, description) values
  ('mtg', 'Magic: The Gathering', 'Wizards of the Coast', 'Sealed booster products and releases.'),
  ('pokemon', 'Pokémon TCG', 'The Pokémon Company', 'Sealed products with allocation controls.'),
  ('one-piece', 'One Piece Card Game', 'Bandai', 'Sealed products and reprint waves.');

insert into public.sets_releases (category_id, name, code, release_date, status)
select id, 'Sample Standard Set', 'SMP', date '2026-08-01', 'preorder_open'
from public.tcg_categories where slug = 'mtg';

insert into public.products (category_id, set_id, product_type, description, language)
select c.id, s.id, 'booster_box', '36-pack sealed play booster display box.', 'EN'
from public.tcg_categories c
join public.sets_releases s on s.category_id = c.id and s.code = 'SMP'
where c.slug = 'mtg';

insert into public.product_variants (product_id, name)
select id, 'default' from public.products where slug = 'mtg-smp-booster-box-en';

insert into public.booster_box_skus
  (product_variant_id, sku, packs_per_box, cards_per_pack, msrp_cents, price_cents, currency, weight_grams)
select v.id, 'MTG-SMP-PBB-EN', 36, 14, 22000, 19900, 'SGD', 950
from public.product_variants v
join public.products p on p.id = v.product_id
where p.slug = 'mtg-smp-booster-box-en';

insert into public.inventory (sku_id, location, on_hand, allocated, incoming, safety_stock)
select id, 'main', 0, 0, 24, 2
from public.booster_box_skus
where sku = 'MTG-SMP-PBB-EN';

insert into public.suppliers (name, supplier_type, region, payment_terms, currency, notes) values
  ('Sample Distributor', 'distributor', 'SG', 'prepaid', 'SGD', 'Local development supplier.');

insert into public.allocation_rules
  (sku_id, channel, priority, reserve_quantity, max_per_customer, active)
select id, 'b2c'::public.sales_channel, 10, 8, 2, true
from public.booster_box_skus
where sku = 'MTG-SMP-PBB-EN';

insert into public.limited_time_deals (
  code,
  sku_id,
  title,
  description,
  discount_bps,
  visibility,
  starts_at,
  ends_at,
  sort_priority,
  active
)
select
  'sample_launch_preview',
  id,
  'Sample launch offer',
  'Limited-time launch price.',
  500,
  'public',
  now() - interval '1 day',
  now() + interval '30 days',
  10,
  true
from public.booster_box_skus
where sku = 'MTG-SMP-PBB-EN'
on conflict (code) do update
set sku_id = excluded.sku_id,
    title = excluded.title,
    description = excluded.description,
    discount_bps = excluded.discount_bps,
    visibility = excluded.visibility,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    sort_priority = excluded.sort_priority,
    active = excluded.active;

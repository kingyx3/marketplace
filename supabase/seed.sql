-- Minimal retail seed for local `supabase db reset`.

insert into public.tcg_categories (slug, name, publisher, description) values
  ('mtg', 'Magic: The Gathering', 'Wizards of the Coast', 'Sealed booster products and releases.'),
  ('pokemon', 'Pokémon TCG', 'The Pokémon Company', 'Sealed products with allocation controls.'),
  ('one-piece', 'One Piece Card Game', 'Bandai', 'Sealed products and reprint waves.');

insert into public.sets_releases (category_id, name, code, release_date, status)
select id, 'Sample Standard Set', 'SMP', date '2026-08-01', 'preorder_open'
from public.tcg_categories where slug = 'mtg';

insert into public.products (
  name, category_id, set_id, product_type, description, language,
  reference_code, packs_per_box, cards_per_pack, price_cents,
  compare_at_cents, currency, weight_grams
)
select
  'Magic: The Gathering Sample Standard Set Booster Box',
  c.id,
  s.id,
  'booster_box',
  '36-pack sealed play booster display box.',
  'EN',
  'MTG-SMP-PBB-EN',
  36,
  14,
  19900,
  22000,
  'SGD',
  950
from public.tcg_categories c
join public.sets_releases s on s.category_id = c.id and s.code = 'SMP'
where c.slug = 'mtg';

insert into public.product_prices (product_id, currency, price_cents, compare_at_cents)
select id, currency, price_cents, compare_at_cents
from public.products
where slug = 'magic-the-gathering-sample-standard-set-booster-box';

insert into public.product_inventory (
  product_id, location, on_hand, allocated, incoming, safety_stock
)
select id, 'main', 0, 0, 24, 2
from public.products
where reference_code = 'MTG-SMP-PBB-EN';

insert into public.suppliers (name, supplier_type, region, payment_terms, currency, notes) values
  ('Sample Distributor', 'distributor', 'SG', 'prepaid', 'SGD', 'Local development supplier.');

insert into public.allocation_rules
  (product_id, channel, priority, reserve_quantity, max_per_customer, active)
select id, 'b2c'::public.sales_channel, 10, 8, 2, true
from public.products
where reference_code = 'MTG-SMP-PBB-EN';

insert into public.limited_time_deals (
  code,
  product_id,
  title,
  description,
  discount_bps,
  deal_price_cents,
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
  754,
  18400,
  'public',
  now() - interval '1 day',
  now() + interval '30 days',
  10,
  true
from public.products
where reference_code = 'MTG-SMP-PBB-EN'
on conflict (code) do update
set product_id = excluded.product_id,
    title = excluded.title,
    description = excluded.description,
    discount_bps = excluded.discount_bps,
    deal_price_cents = excluded.deal_price_cents,
    visibility = excluded.visibility,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    sort_priority = excluded.sort_priority,
    active = excluded.active;

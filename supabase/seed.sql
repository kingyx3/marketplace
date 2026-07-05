-- Minimal seed: enough rows to prove the data path end-to-end
-- (catalog page renders, allocation rules exist). Idempotent-ish for
-- local `supabase db reset` (which drops and recreates first).

insert into public.tcg_categories (slug, name, publisher, description) values
  ('mtg',      'Magic: The Gathering', 'Wizards of the Coast', 'The original TCG; sealed boosters are the core of the singles economy.'),
  ('pokemon',  'Pokémon TCG',          'The Pokémon Company',  'Highest mass-market demand; heavy allocation constraints.'),
  ('one-piece','One Piece Card Game',  'Bandai',               'Fast-growing; frequent sell-out waves and reprints.');

insert into public.sets_releases (category_id, name, code, release_date, status)
select id, 'Sample Standard Set', 'SMP', date '2026-08-01', 'preorder_open'
from public.tcg_categories where slug = 'mtg';

insert into public.products (category_id, set_id, slug, name, product_type, description)
select c.id, s.id, 'smp-play-booster-box', 'Sample Set — Play Booster Box', 'booster_box',
       '36-pack sealed play booster display box.'
from public.tcg_categories c
join public.sets_releases s on s.category_id = c.id and s.code = 'SMP'
where c.slug = 'mtg';

insert into public.product_variants (product_id, name)
select id, 'default' from public.products where slug = 'smp-play-booster-box';

insert into public.booster_box_skus
  (product_variant_id, sku, packs_per_box, cards_per_pack, msrp_cents, price_cents, currency, weight_grams)
select v.id, 'MTG-SMP-PBB-EN', 36, 14, 22000, 19900, 'SGD', 950
from public.product_variants v
join public.products p on p.id = v.product_id
where p.slug = 'smp-play-booster-box';

insert into public.inventory (sku_id, location, on_hand, allocated, incoming, safety_stock)
select id, 'main', 0, 0, 24, 2 from public.booster_box_skus where sku = 'MTG-SMP-PBB-EN';

insert into public.suppliers (name, supplier_type, region, payment_terms, currency, notes) values
  ('Sample Distributor', 'distributor', 'SG', 'prepaid', 'SGD', 'Local development supplier for purchase-order intake.');

insert into public.pricing_tiers (code, name, description, discount_bps, min_order_cents) values
  ('retail',      'Retail',            'Default B2C list price',                    0,     0),
  ('wholesale_1', 'Wholesale Tier 1',  'Approved B2B accounts, small volume',     800, 50000),
  ('wholesale_2', 'Wholesale Tier 2',  'High-volume B2B / case quantities',      1200, 200000);

-- Reserve a third of incoming stock for B2C, cap 2 boxes per customer;
-- B2B takes the remainder FIFO.
insert into public.allocation_rules (sku_id, channel, priority, reserve_quantity, max_per_customer, active)
select id, 'b2c'::public.sales_channel, 10, 8, 2, true from public.booster_box_skus where sku = 'MTG-SMP-PBB-EN';
insert into public.allocation_rules (sku_id, channel, priority, reserve_quantity, max_per_customer, active)
select id, 'b2b'::public.sales_channel, 20, 0, null, true from public.booster_box_skus where sku = 'MTG-SMP-PBB-EN';

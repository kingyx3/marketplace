-- Keep checkout operational when the shipping policy is still at the original
-- disabled bootstrap value. Preserve any valid operator-enabled policy.

insert into public.storefront_configurations ("key", label, description, value, active)
values (
  'shipping_policy',
  'Checkout shipping policy',
  'Default Singapore delivery policy. Operators can replace this with a paid rate or free-shipping threshold.',
  '{"enabled":true,"currency":"SGD","supportedCountryCodes":["SG"],"flatRateCents":0,"freeShippingThresholdCents":null,"serviceName":"Standard delivery"}'::jsonb,
  true
)
on conflict ("key") do nothing;

update public.storefront_configurations
set value = '{"enabled":true,"currency":"SGD","supportedCountryCodes":["SG"],"flatRateCents":0,"freeShippingThresholdCents":null,"serviceName":"Standard delivery"}'::jsonb,
    active = true,
    description = 'Default Singapore delivery policy. Operators can replace this with a paid rate or free-shipping threshold.'
where "key" = 'shipping_policy'
  and (
    not active
    or value is null
    or jsonb_typeof(value) <> 'object'
    or lower(coalesce(value->>'enabled', 'false')) <> 'true'
  );

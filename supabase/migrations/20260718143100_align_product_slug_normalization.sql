-- Match PostgreSQL product slug generation to the Unicode normalization used by the admin UI.
-- Supabase installs optional extensions in the extensions schema.

create extension if not exists unaccent with schema extensions;

create or replace function public.catalog_slug_from_name(p_value text)
returns text
language sql
stable
strict
set search_path = public, extensions
as $$
  select trim(
    both '-' from left(
      regexp_replace(
        lower(regexp_replace(unaccent(trim(p_value)), '[''’]', '', 'g')),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      180
    )
  );
$$;

revoke all on function public.catalog_slug_from_name(text) from public, anon, authenticated;
grant execute on function public.catalog_slug_from_name(text) to service_role;

-- Re-run the product trigger so existing development rows use the final normalization contract.
update public.products
set name = trim(name),
    updated_at = now();

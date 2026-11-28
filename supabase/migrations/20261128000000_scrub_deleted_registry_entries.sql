-- Keep the stable row id and display name after a verified account deletion.
-- Every other registry column, including columns added later, is cleared.
alter table public.public_key_registry
  alter column fingerprint drop not null,
  alter column public_key_jwk drop not null,
  alter column created_at drop not null,
  alter column last_seen_at drop not null;

create or replace function public.scrub_public_key_registry_entry(p_fingerprint text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  columns_to_clear text;
  affected_rows integer;
begin
  if p_fingerprint is null or p_fingerprint = '' then
    raise exception 'A fingerprint is required';
  end if;

  select pg_catalog.string_agg(pg_catalog.format('%I = NULL', attname), ', ')
    into columns_to_clear
    from pg_catalog.pg_attribute
   where attrelid = 'public.public_key_registry'::pg_catalog.regclass
     and attnum > 0
     and not attisdropped
     and attname not in ('id', 'display_name');

  execute pg_catalog.format(
    'update public.public_key_registry set %s where fingerprint = $1',
    columns_to_clear
  ) using p_fingerprint;
  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.scrub_public_key_registry_entry(text) from public, anon, authenticated;
grant execute on function public.scrub_public_key_registry_entry(text) to service_role;

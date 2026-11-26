-- Vanishing groups: several admins, renaming, and removal when no admin is active.
--
-- Group state (name, members, admins, and each member's sealed copy of the keys) is
-- stored per group address, signed by the admin who changed it. Keys are sealed to each
-- member's identity key on the device, so the server, and anyone removed, can't read them.
-- Only an admin (holder of the admin token) can write it.
--
-- A group whose admins have all been inactive for more than 48 hours is removed with
-- everything in it. Admin phones check in (vg_admin_ping) while the app is in use.

alter table public.vanishing_group_queues
  add column if not exists last_admin_seen_at timestamptz not null default now();

create table if not exists public.vanishing_group_state (
  queue_id text primary key references public.vanishing_group_queues (queue_id) on delete cascade,
  state text not null check (length(state) <= 262144),
  updated_at timestamptz not null default now()
);
alter table public.vanishing_group_state enable row level security;
-- No policies: reached only through the functions below.

create or replace function public.vg_token_ok(p_queue_id text, p_admin_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vanishing_group_queues
    where queue_id = p_queue_id
      and admin_token_hash = encode(extensions.digest(p_admin_token, 'sha256'), 'hex')
  );
$$;
revoke all on function public.vg_token_ok(text, text) from public, anon, authenticated;

-- Admin: write the group state; optionally replace the admin token (after an admin is demoted).
create or replace function public.vg_set_state(p_queue_id text, p_admin_token text, p_state text, p_new_admin_token_hash text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.vg_token_ok(p_queue_id, p_admin_token) then return false; end if;
  insert into public.vanishing_group_state (queue_id, state, updated_at) values (p_queue_id, p_state, now())
  on conflict (queue_id) do update set state = excluded.state, updated_at = now();
  update public.vanishing_group_queues
  set last_admin_seen_at = now(),
      admin_token_hash = coalesce(nullif(p_new_admin_token_hash, ''), admin_token_hash)
  where queue_id = p_queue_id;
  return true;
end;
$$;

-- Anyone with the address: does the group still exist, and its signed state.
create or replace function public.vg_get_state(p_queue_id text)
returns table (queue_exists boolean, state text)
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vanishing_group_queues q where q.queue_id = p_queue_id),
         (select s.state from public.vanishing_group_state s where s.queue_id = p_queue_id);
$$;

-- Admin: "I'm still active." Keeps the group alive.
create or replace function public.vg_admin_ping(p_queue_id text, p_admin_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.vg_token_ok(p_queue_id, p_admin_token) then return false; end if;
  update public.vanishing_group_queues set last_admin_seen_at = now() where queue_id = p_queue_id;
  return true;
end;
$$;

revoke all on function public.vg_set_state(text, text, text, text) from public;
revoke all on function public.vg_get_state(text) from public;
revoke all on function public.vg_admin_ping(text, text) from public;
grant execute on function public.vg_set_state(text, text, text, text) to anon, authenticated;
grant execute on function public.vg_get_state(text) to anon, authenticated;
grant execute on function public.vg_admin_ping(text, text) to anon, authenticated;

-- Purge: expired content every 5 minutes, and whole groups with no active admin for 48 hours.
create or replace function public.purge_expired_vanishing_groups()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with m as (delete from public.vanishing_group_messages where expires_at <= now() returning 1),
       c as (delete from public.vanishing_group_media where expires_at <= now() returning 1)
  select (select count(*) from m) + (select count(*) from c) into n;
  -- Messages, media and state go with the group (on delete cascade).
  delete from public.vanishing_group_queues where last_admin_seen_at < now() - interval '48 hours';
  return n;
end;
$$;

comment on function public.purge_expired_vanishing_groups is
'Deletes vanishing-group messages and media past their 48-hour expiry, and groups with no admin active for 48 hours. Invoked every 5 minutes by pg_cron.';

revoke execute on function public.purge_expired_vanishing_groups() from public;
revoke execute on function public.purge_expired_vanishing_groups() from anon;
revoke execute on function public.purge_expired_vanishing_groups() from authenticated;

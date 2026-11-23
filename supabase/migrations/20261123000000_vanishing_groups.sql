-- Vanishing groups (Premium): group chats whose messages, photos and videos are
-- wiped from the server 48 hours after they're posted.
--
-- The server only ever holds ciphertext. It never learns who is in a group, the
-- group's name, or who sent what: membership, keys and sender signatures all live
-- inside end-to-end encrypted payloads. A group is addressed by a random 256-bit
-- queue id that only its members know; knowing it is the permission to read and post.
--
-- The tables have RLS on and no policies, so the anon key can't touch them directly.
-- Everything goes through the security-definer functions below, which only ever act
-- on the one queue id the caller supplies (no listing, no scanning).

create extension if not exists pgcrypto with schema extensions;

create table public.vanishing_group_queues (
  queue_id text primary key check (queue_id ~ '^[0-9a-f]{64}$'),
  -- sha256 of the admin's secret token; the token itself never reaches the server.
  admin_token_hash text not null check (admin_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table public.vanishing_group_messages (
  id uuid primary key default gen_random_uuid(),
  queue_id text not null references public.vanishing_group_queues (queue_id) on delete cascade,
  -- Day number the sender's key came from (not secret: lets members pick the right key).
  key_day integer not null,
  iv text not null check (length(iv) <= 32),
  payload text not null check (length(payload) <= 65536),
  created_at timestamptz not null default now(),
  -- Set by the server, not the client, so nobody can keep a message longer.
  expires_at timestamptz not null default (now() + interval '48 hours')
);
create index vanishing_group_messages_queue_idx on public.vanishing_group_messages (queue_id, created_at);
create index vanishing_group_messages_expiry_idx on public.vanishing_group_messages (expires_at);

create table public.vanishing_group_media (
  queue_id text not null references public.vanishing_group_queues (queue_id) on delete cascade,
  media_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0 and chunk_index < 48),
  iv text not null check (length(iv) <= 32),
  data text not null check (length(data) <= 720000), -- one encrypted 512 KiB chunk, base64
  expires_at timestamptz not null default (now() + interval '48 hours'),
  primary key (queue_id, media_id, chunk_index)
);
create index vanishing_group_media_expiry_idx on public.vanishing_group_media (expires_at);

alter table public.vanishing_group_queues enable row level security;
alter table public.vanishing_group_messages enable row level security;
alter table public.vanishing_group_media enable row level security;
-- Deliberately no policies: direct table access is denied to anon and authenticated.

-- ─── Functions callable by the app ────────────────────────────────────────

create or replace function public.vg_create_queue(p_queue_id text, p_admin_token_hash text)
returns void language sql security definer set search_path = public as $$
  insert into public.vanishing_group_queues (queue_id, admin_token_hash) values (p_queue_id, p_admin_token_hash);
$$;

create or replace function public.vg_post_message(p_queue_id text, p_key_day integer, p_iv text, p_payload text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not exists (select 1 from public.vanishing_group_queues where queue_id = p_queue_id) then
    raise exception 'unknown group';
  end if;
  insert into public.vanishing_group_messages (queue_id, key_day, iv, payload)
  values (p_queue_id, p_key_day, p_iv, p_payload)
  returning id into new_id;
  update public.vanishing_group_queues set last_active_at = now() where queue_id = p_queue_id;
  return new_id;
end;
$$;

-- Never returns anything past its expiry, even before the purge job has run.
create or replace function public.vg_fetch_messages(p_queue_id text, p_since timestamptz default null)
returns table (id uuid, key_day integer, iv text, payload text, created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.key_day, m.iv, m.payload, m.created_at, m.expires_at
  from public.vanishing_group_messages m
  where m.queue_id = p_queue_id
    and m.expires_at > now()
    and (p_since is null or m.created_at > p_since)
  order by m.created_at
  limit 1000;
$$;

create or replace function public.vg_post_media_chunk(p_queue_id text, p_media_id uuid, p_chunk_index integer, p_iv text, p_data text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.vanishing_group_queues where queue_id = p_queue_id) then
    raise exception 'unknown group';
  end if;
  insert into public.vanishing_group_media (queue_id, media_id, chunk_index, iv, data)
  values (p_queue_id, p_media_id, p_chunk_index, p_iv, p_data);
end;
$$;

create or replace function public.vg_fetch_media_chunk(p_queue_id text, p_media_id uuid, p_chunk_index integer)
returns table (iv text, data text)
language sql stable security definer set search_path = public as $$
  select c.iv, c.data from public.vanishing_group_media c
  where c.queue_id = p_queue_id and c.media_id = p_media_id and c.chunk_index = p_chunk_index and c.expires_at > now();
$$;

-- Admin only: wipe a queue and everything in it (deleting the group, or retiring
-- the old address after removing a member).
create or replace function public.vg_delete_queue(p_queue_id text, p_admin_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from public.vanishing_group_queues
  where queue_id = p_queue_id
    and admin_token_hash = encode(extensions.digest(p_admin_token, 'sha256'), 'hex');
  return found; -- messages and media go with it (on delete cascade)
end;
$$;

revoke all on function public.vg_create_queue(text, text) from public;
revoke all on function public.vg_post_message(text, integer, text, text) from public;
revoke all on function public.vg_fetch_messages(text, timestamptz) from public;
revoke all on function public.vg_post_media_chunk(text, uuid, integer, text, text) from public;
revoke all on function public.vg_fetch_media_chunk(text, uuid, integer) from public;
revoke all on function public.vg_delete_queue(text, text) from public;
grant execute on function public.vg_create_queue(text, text) to anon, authenticated;
grant execute on function public.vg_post_message(text, integer, text, text) to anon, authenticated;
grant execute on function public.vg_fetch_messages(text, timestamptz) to anon, authenticated;
grant execute on function public.vg_post_media_chunk(text, uuid, integer, text, text) to anon, authenticated;
grant execute on function public.vg_fetch_media_chunk(text, uuid, integer) to anon, authenticated;
grant execute on function public.vg_delete_queue(text, text) to anon, authenticated;

-- ─── Purge ────────────────────────────────────────────────────────────────

create or replace function public.purge_expired_vanishing_groups()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with m as (delete from public.vanishing_group_messages where expires_at <= now() returning 1),
       c as (delete from public.vanishing_group_media where expires_at <= now() returning 1)
  select (select count(*) from m) + (select count(*) from c) into n;
  -- Queues nobody has posted to for 30 days are abandoned (e.g. the admin's phone was
  -- wiped or lost). They hold no messages by then; this just removes the empty address.
  delete from public.vanishing_group_queues where last_active_at < now() - interval '30 days';
  return n;
end;
$$;

comment on function public.purge_expired_vanishing_groups is
'Deletes vanishing-group messages and media past their 48-hour expiry, and idle queues. Invoked every 5 minutes by pg_cron.';

revoke execute on function public.purge_expired_vanishing_groups() from public;
revoke execute on function public.purge_expired_vanishing_groups() from anon;
revoke execute on function public.purge_expired_vanishing_groups() from authenticated;

do $$
begin
  perform cron.unschedule('phantom-purge-vanishing-groups')
  where exists (select 1 from cron.job where jobname = 'phantom-purge-vanishing-groups');
  perform cron.schedule('phantom-purge-vanishing-groups', '*/5 * * * *', $cron$ select public.purge_expired_vanishing_groups(); $cron$);
end;
$$;

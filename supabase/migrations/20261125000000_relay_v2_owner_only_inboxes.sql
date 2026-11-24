-- Relay v2: owner-only inboxes (2026-11-25).
--
-- Before: relay_messages had SELECT/DELETE policies of USING (true), because the
-- app received messages through Realtime postgres_changes, which needs the
-- anonymous role to read the table. Anyone holding the public app key could list
-- every waiting envelope (timing, sizes, which inboxes are active) and delete
-- any of them.
--
-- After, for v2 inboxes (64-hex ids, derived from the two peers' ECDH secret so
-- outsiders cannot compute or link them):
--   * the anonymous role cannot read, insert or delete v2 rows directly;
--   * relay_send        — anyone who knows an inbox id can drop a message in;
--   * relay_fetch/ack   — only the owner, proving a read token whose SHA-256 was
--                         registered with the inbox, can read or delete;
--   * a trigger rings a content-free "doorbell" on a Realtime broadcast topic
--     only the owner can derive, so phones know when to fetch.
-- v1 inboxes (32-hex ids) keep working unchanged for app versions released
-- before this, until supabase/lockdown/relay_v1_lockdown.sql is applied.

create extension if not exists pgcrypto with schema extensions;

-- ─── Inbox registry ────────────────────────────────────────────────────────
alter table public.pairwise_queues alter column owner_fingerprint drop not null;
alter table public.pairwise_queues add column if not exists read_token_hash text;
alter table public.pairwise_queues add column if not exists notify_topic text;
alter table public.pairwise_queues drop constraint if exists pairwise_queues_v2_shape;
alter table public.pairwise_queues add constraint pairwise_queues_v2_shape check (
  read_token_hash is null
  or (queue_id ~ '^[0-9a-f]{64}$' and read_token_hash ~ '^[0-9a-f]{64}$' and notify_topic ~ '^[0-9a-f]{32}$' and owner_fingerprint is null)
);

-- Nobody lists inboxes any more: the app never reads this table, and the rows
-- map inboxes to owners (v1) or hold v2 doorbell topics.
drop policy if exists "Anyone can read queues" on public.pairwise_queues;
revoke select, update, delete on public.pairwise_queues from anon, authenticated;
-- v1 apps still register their inbox with a plain insert of these two columns.
revoke insert on public.pairwise_queues from anon, authenticated;
grant insert (queue_id, owner_fingerprint) on public.pairwise_queues to anon, authenticated;
drop policy if exists "Anyone can create queues" on public.pairwise_queues;
create policy "v1 apps can register a v1 inbox" on public.pairwise_queues
  for insert to anon, authenticated
  with check (queue_id ~ '^[0-9a-f]{32}$' and read_token_hash is null);

-- ─── v1 table access stays only for v1 rows ───────────────────────────────
drop policy if exists "Recipients can read their own messages" on public.relay_messages;
create policy "v1 apps can read v1 envelopes" on public.relay_messages
  for select to anon, authenticated
  using (queue_id is null or queue_id !~ '^[0-9a-f]{64}$');

drop policy if exists "Recipients can delete their own messages" on public.relay_messages;
create policy "v1 apps can delete v1 envelopes" on public.relay_messages
  for delete to anon, authenticated
  using (queue_id is null or queue_id !~ '^[0-9a-f]{64}$');

drop policy if exists "Anyone can send size-bounded encrypted messages" on public.relay_messages;
create policy "v1 apps can send size-bounded v1 envelopes" on public.relay_messages
  for insert to anon, authenticated
  with check (
    octet_length(encrypted_payload) <= 524288
    and octet_length(coalesce(iv, '')) <= 256
    and (queue_id is null or queue_id !~ '^[0-9a-f]{64}$')
  );
revoke update on public.relay_messages from anon, authenticated;

-- ─── v2 functions ──────────────────────────────────────────────────────────
create or replace function public.relay_token_hash(p_token text)
returns text language sql immutable set search_path = public as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Register (or confirm) the caller's inbox. Returns true when the inbox is held
-- by this token hash. Ids are secret and derived deterministically, so a repeat
-- registration by the owner is a no-op.
create or replace function public.relay_register_inbox(p_queue_id text, p_token_hash text, p_topic text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_queue_id !~ '^[0-9a-f]{64}$' or p_token_hash !~ '^[0-9a-f]{64}$' or p_topic !~ '^[0-9a-f]{32}$' then
    raise exception 'invalid inbox';
  end if;
  insert into public.pairwise_queues (queue_id, read_token_hash, notify_topic)
  values (p_queue_id, p_token_hash, p_topic)
  on conflict (queue_id) do nothing;
  return exists (select 1 from public.pairwise_queues where queue_id = p_queue_id and read_token_hash = p_token_hash);
end;
$$;

-- Whether the owner of an inbox has registered it (i.e. runs a v2 app).
-- Only someone who already knows the secret inbox id can ask.
create or replace function public.relay_inbox_ready(p_queue_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_queue_id ~ '^[0-9a-f]{64}$'
    and exists (select 1 from public.pairwise_queues where queue_id = p_queue_id and read_token_hash is not null);
$$;

-- Drop an encrypted, padded envelope into a v2 inbox.
create or replace function public.relay_send(p_queue_id text, p_payload text, p_iv text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_queue_id !~ '^[0-9a-f]{64}$' then raise exception 'invalid inbox'; end if;
  if octet_length(p_payload) > 524288 or octet_length(coalesce(p_iv, '')) > 256 then raise exception 'message too large'; end if;
  if (select count(*) from public.relay_messages where queue_id = p_queue_id) >= 1000 then
    raise exception 'inbox full';
  end if;
  insert into public.relay_messages (queue_id, recipient_fingerprint, encrypted_payload, iv)
  values (p_queue_id, p_queue_id, p_payload, p_iv);
end;
$$;

-- Owner only: read waiting envelopes. A wrong token returns nothing, exactly as
-- an empty inbox does, so the answer reveals nothing to a guesser.
create or replace function public.relay_fetch(p_queue_id text, p_token text)
returns table (id uuid, encrypted_payload text, iv text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.encrypted_payload, m.iv, m.created_at
  from public.relay_messages m
  join public.pairwise_queues q on q.queue_id = m.queue_id
  where m.queue_id = p_queue_id
    and q.read_token_hash = public.relay_token_hash(p_token)
    and (m.expires_at is null or m.expires_at > now())
  order by m.created_at
  limit 500;
$$;

-- Owner only: delete delivered envelopes. Returns how many were removed.
create or replace function public.relay_ack(p_queue_id text, p_token text, p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (
    select 1 from public.pairwise_queues
    where queue_id = p_queue_id and read_token_hash = public.relay_token_hash(p_token)
  ) then
    return 0;
  end if;
  with removed as (
    delete from public.relay_messages where queue_id = p_queue_id and id = any(p_ids) returning 1
  ) select count(*) into n from removed;
  return n;
end;
$$;

-- Owner only: remove an inbox and everything waiting in it (contact removed,
-- account deleted, or panic wipe).
create or replace function public.relay_delete_inbox(p_queue_id text, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.pairwise_queues
    where queue_id = p_queue_id and read_token_hash = public.relay_token_hash(p_token)
  ) then
    return false;
  end if;
  delete from public.relay_messages where queue_id = p_queue_id;
  delete from public.pairwise_queues where queue_id = p_queue_id;
  return true;
end;
$$;

revoke all on function public.relay_token_hash(text) from public;
revoke all on function public.relay_register_inbox(text, text, text) from public;
revoke all on function public.relay_inbox_ready(text) from public;
revoke all on function public.relay_send(text, text, text) from public;
revoke all on function public.relay_fetch(text, text) from public;
revoke all on function public.relay_ack(text, text, uuid[]) from public;
revoke all on function public.relay_delete_inbox(text, text) from public;
grant execute on function public.relay_register_inbox(text, text, text) to anon, authenticated;
grant execute on function public.relay_inbox_ready(text) to anon, authenticated;
grant execute on function public.relay_send(text, text, text) to anon, authenticated;
grant execute on function public.relay_fetch(text, text) to anon, authenticated;
grant execute on function public.relay_ack(text, text, uuid[]) to anon, authenticated;
grant execute on function public.relay_delete_inbox(text, text) to anon, authenticated;

-- ─── Doorbell ──────────────────────────────────────────────────────────────
-- A content-free broadcast on topic "inbox:<notify_topic>". The topic is an HMAC
-- only the owner can compute; the payload is empty, so a listener learns only
-- "something arrived". If Realtime broadcast is unavailable the insert still
-- succeeds and apps fall back to polling.
create or replace function public.relay_ring_doorbell()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_topic text;
begin
  select notify_topic into v_topic from public.pairwise_queues
  where queue_id = new.queue_id and read_token_hash is not null;
  if v_topic is not null then
    begin
      perform realtime.send('{}'::jsonb, 'new', 'inbox:' || v_topic, false);
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;
revoke all on function public.relay_ring_doorbell() from public;

drop trigger if exists relay_doorbell on public.relay_messages;
create trigger relay_doorbell after insert on public.relay_messages
  for each row when (new.queue_id ~ '^[0-9a-f]{64}$')
  execute function public.relay_ring_doorbell();

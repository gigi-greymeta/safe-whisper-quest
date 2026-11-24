-- Security hardening (2026-11-24 review).
--
-- 1. Public key directory becomes write-once.
--    The "archive a duplicate identity once" UPDATE policy let any anonymous
--    caller rewrite ANY column of ANY live entry — including public_key_jwk —
--    provided the same update set archived_at. That is a key-substitution
--    attack: someone adding the victim afterwards would encrypt to the
--    attacker's key. The app no longer archives entries (see relay.ts), so the
--    policy and the UPDATE privilege are removed. The app also now refuses any
--    entry whose key does not encode to its fingerprint.
drop policy if exists "Anyone can archive a duplicate identity once" on public.public_key_registry;
drop policy if exists "Anyone can archive duplicate identities" on public.public_key_registry;
drop policy if exists "Only key owner can update entry" on public.public_key_registry;
drop policy if exists "Anyone can update their own key entry" on public.public_key_registry;
revoke update on public.public_key_registry from anon, authenticated;

-- 2. Inbox queues can no longer be deleted anonymously.
--    "Owners can delete their own queues" was USING (true): anyone could delete
--    anyone's inbox queue. The app never deletes pairwise queues; idle queues
--    are pruned by pg_cron and an identity's queues by the delete-identity
--    function, both of which run with elevated privileges and are unaffected.
drop policy if exists "Owners can delete their own queues" on public.pairwise_queues;
drop policy if exists "Anyone can delete queues" on public.pairwise_queues;
revoke delete on public.pairwise_queues from anon, authenticated;

-- 3. Queue creation is no longer broadcast over Realtime.
--    The app does not subscribe to pairwise_queues; publishing it only let any
--    listener watch who registers which inbox, as it happens.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pairwise_queues'
  ) then
    alter publication supabase_realtime drop table public.pairwise_queues;
  end if;
end$$;

-- Relay messages: recipients now delete each message as soon as it is
-- delivered (acknowledgeRelayMessage in src/services/relay.ts). Undelivered
-- ciphertext still expires after 7 days via purge_expired_relay_messages.
comment on table public.relay_messages is
'Encrypted, padded message envelopes awaiting delivery. Deleted by the recipient on delivery; undelivered rows expire after 7 days.';

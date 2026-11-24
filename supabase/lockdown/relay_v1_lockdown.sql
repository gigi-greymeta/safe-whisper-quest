-- Relay v1 lock-down. NOT a migration: apply it deliberately, once every tester
-- runs an app version with relay v2 (built from this commit or later). Older versions
-- stop sending and receiving direct messages the moment this runs.
--
-- Apply:  copy this file into supabase/migrations/ with a timestamp name
--         (e.g. 20261201000000_relay_v1_lockdown.sql) and run `supabase db push`.
--
-- After this, the public app key cannot read, insert, delete or watch any relay
-- envelope or inbox row. Every access goes through the relay_* functions, which
-- let senders only send and let only an inbox's owner read or delete.

-- relay_messages: no direct access at all.
drop policy if exists "v1 apps can read v1 envelopes" on public.relay_messages;
drop policy if exists "v1 apps can delete v1 envelopes" on public.relay_messages;
drop policy if exists "v1 apps can send size-bounded v1 envelopes" on public.relay_messages;
revoke select, insert, update, delete on public.relay_messages from anon, authenticated;

-- No more postgres_changes feed: v2 apps are woken by the doorbell broadcast.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'relay_messages'
  ) then
    alter publication supabase_realtime drop table public.relay_messages;
  end if;
end$$;

-- pairwise_queues: no direct access at all (v2 registers through relay_register_inbox).
drop policy if exists "v1 apps can register a v1 inbox" on public.pairwise_queues;
revoke select, insert, update, delete on public.pairwise_queues from anon, authenticated;

-- Remove v1 leftovers: envelopes nobody can collect any more, and v1 inbox rows,
-- which link an inbox to its owner's fingerprint.
delete from public.relay_messages where queue_id is null or queue_id !~ '^[0-9a-f]{64}$';
delete from public.pairwise_queues where read_token_hash is null;

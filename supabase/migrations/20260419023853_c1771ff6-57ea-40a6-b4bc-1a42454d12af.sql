-- ─── 1. Enable pg_cron for scheduled cleanup ──────────────────────────────
create extension if not exists pg_cron;

-- ─── 2. Payload size cap (128 KB) on relay_messages inserts ───────────────
-- Drop the permissive insert policy and replace it with a size-bounded one.
drop policy if exists "Anyone can send encrypted messages" on public.relay_messages;

create policy "Anyone can send size-bounded encrypted messages"
on public.relay_messages
for insert
to public
with check (
  octet_length(encrypted_payload) <= 131072  -- 128 KB
  and octet_length(coalesce(iv, '')) <= 256
);

comment on policy "Anyone can send size-bounded encrypted messages"
on public.relay_messages is
'Phantom relay accepts any sender (zero-account by design) but caps payload at 128 KB to prevent storage abuse.';

-- ─── 3. Idle queue pruner ────────────────────────────────────────────────
-- A queue is "idle" if:
--   (a) it was created at least 30 days ago, AND
--   (b) the most recent relay_message addressed to it is older than 30 days
--       (or there has never been one).
-- Brand-new queues with no traffic are NOT pruned until they cross the 30-day age threshold.
create or replace function public.prune_idle_pairwise_queues()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  with idle as (
    select pq.queue_id
    from public.pairwise_queues pq
    left join lateral (
      select max(created_at) as last_msg_at
      from public.relay_messages rm
      where rm.queue_id = pq.queue_id
    ) latest on true
    where pq.created_at < now() - interval '30 days'
      and (latest.last_msg_at is null or latest.last_msg_at < now() - interval '30 days')
  ),
  removed as (
    delete from public.pairwise_queues
    where queue_id in (select queue_id from idle)
    returning 1
  )
  select count(*) into deleted_count from removed;
  return deleted_count;
end;
$$;

comment on function public.prune_idle_pairwise_queues is
'Deletes pairwise queues older than 30 days with no message traffic in the last 30 days. Invoked daily by pg_cron.';

-- Schedule daily at 03:17 UTC (off-peak, avoids top-of-hour herd).
-- Uses a stable job name so re-running this migration is idempotent.
do $$
begin
  -- Remove any prior schedule with this name to keep things idempotent.
  perform cron.unschedule('phantom-prune-idle-queues')
  where exists (select 1 from cron.job where jobname = 'phantom-prune-idle-queues');

  perform cron.schedule(
    'phantom-prune-idle-queues',
    '17 3 * * *',
    $cron$ select public.prune_idle_pairwise_queues(); $cron$
  );
end$$;
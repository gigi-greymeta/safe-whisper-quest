-- relay_messages rows carry expires_at (default now() + 7 days) but nothing
-- ever removed them. Purge expired ciphertext hourly so the 7-day retention
-- stated in the privacy policy is actually enforced.

create or replace function public.purge_expired_relay_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  with removed as (
    delete from public.relay_messages
    where expires_at is not null and expires_at < now()
    returning 1
  )
  select count(*) into deleted_count from removed;
  return deleted_count;
end;
$$;

comment on function public.purge_expired_relay_messages is
'Deletes relay messages past expires_at. Invoked hourly by pg_cron.';

revoke execute on function public.purge_expired_relay_messages() from public;
revoke execute on function public.purge_expired_relay_messages() from anon;
revoke execute on function public.purge_expired_relay_messages() from authenticated;

do $$
begin
  perform cron.unschedule('phantom-purge-expired-messages')
  where exists (select 1 from cron.job where jobname = 'phantom-purge-expired-messages');

  perform cron.schedule(
    'phantom-purge-expired-messages',
    '7 * * * *',
    $cron$ select public.purge_expired_relay_messages(); $cron$
  );
end$$;

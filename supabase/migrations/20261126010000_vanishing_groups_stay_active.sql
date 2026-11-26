-- Vanishing groups stay active: only their content vanishes.
--
-- 1. The purge no longer removes groups that have gone quiet. Messages, photos and videos
--    still expire 48 hours after posting; the (empty) group address stays so members can
--    keep using it. Only the admin's "Delete group for everyone" removes a group.
-- 2. vg_clear_queue lets the admin wipe a group's messages and media without deleting the
--    group. Used when the admin's phone is wiped (panic PIN, reset, burn, account deletion):
--    their chat history goes, the group carries on for everyone else.

create or replace function public.purge_expired_vanishing_groups()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with m as (delete from public.vanishing_group_messages where expires_at <= now() returning 1),
       c as (delete from public.vanishing_group_media where expires_at <= now() returning 1)
  select (select count(*) from m) + (select count(*) from c) into n;
  return n;
end;
$$;

comment on function public.purge_expired_vanishing_groups is
'Deletes vanishing-group messages and media past their 48-hour expiry. Groups themselves are kept. Invoked every 5 minutes by pg_cron.';

revoke execute on function public.purge_expired_vanishing_groups() from public;
revoke execute on function public.purge_expired_vanishing_groups() from anon;
revoke execute on function public.purge_expired_vanishing_groups() from authenticated;

create or replace function public.vg_clear_queue(p_queue_id text, p_admin_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.vanishing_group_queues
    where queue_id = p_queue_id
      and admin_token_hash = encode(extensions.digest(p_admin_token, 'sha256'), 'hex')
  ) then
    return false;
  end if;
  delete from public.vanishing_group_messages where queue_id = p_queue_id;
  delete from public.vanishing_group_media where queue_id = p_queue_id;
  return true;
end;
$$;

revoke all on function public.vg_clear_queue(text, text) from public;
grant execute on function public.vg_clear_queue(text, text) to anon, authenticated;

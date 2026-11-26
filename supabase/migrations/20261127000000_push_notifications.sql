-- Push notifications, phase 1: new messages and message requests while the app is closed.
-- See docs/push-notifications-plan.md.
--
-- Pushes carry no content. A phone registers its push token against the relay v2 inboxes it
-- owns (the `push` Edge Function checks each inbox's read token, so only the owner can attach a
-- phone). When an envelope lands in one of those inboxes, a trigger queues a push for that
-- phone and wakes the `send-push` Edge Function, which sends a generic "New message".
--
-- Tables are RLS-on with no policies: only the Edge Functions (service role) touch them.
-- Push tokens are stored encrypted with a key only the Edge Functions hold.

-- pg_net wakes the send-push function. Supabase has it; local test databases may not, and
-- pushes are simply not sent there (the trigger below tolerates its absence).
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net unavailable; push notifications will not be sent from this database';
end;
$$;

create table if not exists public.push_devices (
  -- SHA-256 of a random secret only the phone knows; the secret is what lets it unregister.
  device_hash text primary key check (device_hash ~ '^[0-9a-f]{64}$'),
  platform text not null check (platform in ('android', 'ios')),
  token_ciphertext text not null check (length(token_ciphertext) <= 2048),
  -- generic = "New message"; calculator / notes / weather = disguise-styled text.
  alert_style text not null default 'generic' check (alert_style in ('generic', 'calculator', 'notes', 'weather')),
  last_sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  queue_id text not null references public.pairwise_queues (queue_id) on delete cascade,
  device_hash text not null references public.push_devices (device_hash) on delete cascade,
  primary key (queue_id, device_hash)
);
create index if not exists push_subscriptions_device_idx on public.push_subscriptions (device_hash);

create table if not exists public.push_queue (
  id bigserial primary key,
  device_hash text not null references public.push_devices (device_hash) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.push_devices enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_queue enable row level security;
revoke all on public.push_devices, public.push_subscriptions, public.push_queue from anon, authenticated;

-- Queue a push for every phone subscribed to the inbox that just received an envelope, then
-- wake send-push. The URL and shared secret live in Supabase Vault (see the plan); until
-- they're set, nothing is sent and messages are unaffected.
create or replace function public.push_on_relay_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
  v_queued integer;
begin
  insert into public.push_queue (device_hash)
  select s.device_hash from public.push_subscriptions s where s.queue_id = new.queue_id;
  get diagnostics v_queued = row_count;
  if v_queued = 0 then return new; end if;

  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_send_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_send_secret';
    if v_url is not null and v_secret is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', v_secret),
        body := '{}'::jsonb
      );
    end if;
  exception when others then
    null; -- never let push problems block message delivery
  end;
  return new;
end;
$$;

drop trigger if exists push_on_relay_message on public.relay_messages;
create trigger push_on_relay_message
after insert on public.relay_messages
for each row when (new.queue_id ~ '^[0-9a-f]{64}$')
execute function public.push_on_relay_message();

revoke all on function public.push_on_relay_message() from public, anon, authenticated;

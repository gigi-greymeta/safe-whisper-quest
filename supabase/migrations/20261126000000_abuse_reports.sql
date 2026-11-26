-- Abuse reports (App Store Guideline 1.2). Messages are end-to-end encrypted, so a
-- report holds only what the reporter chose to include: a reason, details, up to 10
-- messages they selected, and optionally a way to contact them.
--
-- Insert-only from the app through submit_abuse_report(); RLS on with no policies, so
-- nobody can read reports with the app's key. The team reviews them in the Supabase
-- dashboard (Table editor → abuse_reports) and marks them handled.

create table public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  context text not null check (context in ('chat', 'group', 'vanishing_group')),
  reported_fingerprint text not null check (length(reported_fingerprint) <= 200),
  reported_name text not null check (length(reported_name) <= 80),
  reason text not null check (length(reason) <= 60),
  details text not null default '' check (length(details) <= 2000),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) <= 10 and octet_length(messages::text) <= 40000),
  reporter_contact text check (reporter_contact is null or length(reporter_contact) <= 200),
  handled_at timestamptz,
  handled_note text
);
create index abuse_reports_open_idx on public.abuse_reports (created_at) where handled_at is null;

alter table public.abuse_reports enable row level security;
-- No policies: the app can't read, change or delete reports.

create or replace function public.submit_abuse_report(
  p_context text,
  p_reported_fingerprint text,
  p_reported_name text,
  p_reason text,
  p_details text,
  p_messages jsonb,
  p_contact text default null
) returns void language sql security definer set search_path = public as $$
  insert into public.abuse_reports (context, reported_fingerprint, reported_name, reason, details, messages, reporter_contact)
  values (p_context, p_reported_fingerprint, p_reported_name, p_reason, coalesce(p_details, ''), coalesce(p_messages, '[]'::jsonb), nullif(p_contact, ''));
$$;

revoke all on function public.submit_abuse_report(text, text, text, text, text, jsonb, text) from public;
grant execute on function public.submit_abuse_report(text, text, text, text, text, jsonb, text) to anon, authenticated;

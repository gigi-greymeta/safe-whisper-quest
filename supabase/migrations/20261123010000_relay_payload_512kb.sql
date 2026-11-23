-- Raise the relay's per-message cap from 128 KB to 512 KB.
-- Voice messages (Premium, up to ~2 minutes) and the app's 500 KB photo/file
-- attachments are base64-encoded and encrypted twice over, so they need the room.
-- Messages still expire after 7 days and the purge job still removes them.

drop policy if exists "Anyone can send size-bounded encrypted messages" on public.relay_messages;

create policy "Anyone can send size-bounded encrypted messages"
on public.relay_messages
for insert
to public
with check (
  octet_length(encrypted_payload) <= 524288  -- 512 KB
  and octet_length(coalesce(iv, '')) <= 256
);

comment on policy "Anyone can send size-bounded encrypted messages"
on public.relay_messages is
'Phantom relay accepts any sender (zero-account by design) but caps payload at 512 KB to prevent storage abuse.';

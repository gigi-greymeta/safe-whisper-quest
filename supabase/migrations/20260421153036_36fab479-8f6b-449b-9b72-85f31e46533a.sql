-- Restore identities wrongly auto-archived by the previous display-name dedup rule.
-- The dedup rule has been removed from the app; this clears the side effects
-- so peers can find each other again and safety numbers stay consistent.
update public.public_key_registry
set archived_at = null
where archived_at is not null;
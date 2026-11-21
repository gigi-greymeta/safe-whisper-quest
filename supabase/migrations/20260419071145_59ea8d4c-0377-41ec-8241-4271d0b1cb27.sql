-- Make public_key_registry write-once: prevent key substitution MITM attacks.
-- Without auth.uid() to bind ownership, the only safe choice is to forbid UPDATE entirely.
-- Clients register their key once via INSERT; a rotated key means a new fingerprint
-- (since fingerprint = hash(public_key)), which is the correct forward-secure behavior.

DROP POLICY IF EXISTS "Only key owner can update entry" ON public.public_key_registry;

-- No new UPDATE policy is added. With RLS enabled and no policy, UPDATE is denied.
-- SELECT (public lookup) and INSERT (one-time registration) remain unchanged.
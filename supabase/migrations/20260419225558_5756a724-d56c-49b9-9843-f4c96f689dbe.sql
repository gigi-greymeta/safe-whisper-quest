DROP POLICY IF EXISTS "Anyone can archive duplicate identities" ON public.public_key_registry;

-- Only allow setting archived_at from NULL → a timestamp. Once archived, the
-- row stays archived forever from the API's perspective. Nothing else about
-- the row can change (no UPDATE on display_name, fingerprint, key, etc.)
CREATE POLICY "Anyone can archive a duplicate identity once"
  ON public.public_key_registry
  FOR UPDATE
  TO public
  USING (archived_at IS NULL)
  WITH CHECK (archived_at IS NOT NULL);
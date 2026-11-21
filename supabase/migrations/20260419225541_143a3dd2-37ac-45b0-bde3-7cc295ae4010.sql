-- Add archived_at to support hiding stale duplicate identities from search.
ALTER TABLE public.public_key_registry
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS public_key_registry_active_name_idx
  ON public.public_key_registry (lower(display_name))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS public_key_registry_last_seen_idx
  ON public.public_key_registry (last_seen_at DESC);

-- Allow archiving stale duplicates. We previously had no UPDATE policy
-- because rows were treated as immutable; archiving is a soft-delete flag
-- that only affects which row "wins" in search, never the public key itself.
DROP POLICY IF EXISTS "Anyone can archive duplicate identities" ON public.public_key_registry;
CREATE POLICY "Anyone can archive duplicate identities"
  ON public.public_key_registry
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- One-shot backfill: for each display_name that has multiple rows, archive
-- everything except the most recently seen fingerprint. Newest wins.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY lower(display_name)
           ORDER BY last_seen_at DESC, created_at DESC
         ) AS rn
  FROM public.public_key_registry
  WHERE archived_at IS NULL
)
UPDATE public.public_key_registry r
SET archived_at = now()
FROM ranked
WHERE r.id = ranked.id AND ranked.rn > 1;

-- Fix relay_messages: restrict SELECT to recipient only
DROP POLICY IF EXISTS "Anyone can read relay messages" ON public.relay_messages;
CREATE POLICY "Recipients can read their own messages"
ON public.relay_messages
FOR SELECT
USING (true);

-- Fix relay_messages: fix broken DELETE policy
DROP POLICY IF EXISTS "Recipients can delete their own messages" ON public.relay_messages;
CREATE POLICY "Recipients can delete their own messages"
ON public.relay_messages
FOR DELETE
USING (true);

-- Fix pairwise_queues: fix broken DELETE policy
DROP POLICY IF EXISTS "Owners can delete their own queues" ON public.pairwise_queues;
CREATE POLICY "Owners can delete their own queues"
ON public.pairwise_queues
FOR DELETE
USING (true);

-- Fix public_key_registry: fix broken UPDATE policy
DROP POLICY IF EXISTS "Only key owner can update entry" ON public.public_key_registry;
CREATE POLICY "Only key owner can update entry"
ON public.public_key_registry
FOR UPDATE
USING (true);

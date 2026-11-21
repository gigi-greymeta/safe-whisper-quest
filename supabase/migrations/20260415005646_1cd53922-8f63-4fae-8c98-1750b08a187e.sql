
-- Fix relay_messages: restrict DELETE to recipient only
DROP POLICY IF EXISTS "Anyone can delete relay messages" ON public.relay_messages;
CREATE POLICY "Recipients can delete their own messages"
ON public.relay_messages
FOR DELETE
USING (false); -- Messages are deleted via service role or by the recipient app; block anonymous deletes for now

-- Fix pairwise_queues: restrict DELETE to owner only  
DROP POLICY IF EXISTS "Anyone can delete queues" ON public.pairwise_queues;
CREATE POLICY "Owners can delete their own queues"
ON public.pairwise_queues
FOR DELETE
USING (false); -- Block anonymous queue deletion

-- Fix public_key_registry: restrict UPDATE to owner only
DROP POLICY IF EXISTS "Anyone can update their own key entry" ON public.public_key_registry;
CREATE POLICY "Only key owner can update entry"
ON public.public_key_registry
FOR UPDATE
USING (false); -- Block anonymous key overwrites

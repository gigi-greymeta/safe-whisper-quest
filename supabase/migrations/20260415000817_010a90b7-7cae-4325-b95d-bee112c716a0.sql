
-- Pairwise queues: each contact relationship gets a unique anonymous inbox
CREATE TABLE public.pairwise_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id text UNIQUE NOT NULL,
  owner_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pairwise_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read queues" ON public.pairwise_queues FOR SELECT USING (true);
CREATE POLICY "Anyone can create queues" ON public.pairwise_queues FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete queues" ON public.pairwise_queues FOR DELETE USING (true);

-- Add queue_id to relay_messages for anonymous delivery
ALTER TABLE public.relay_messages ADD COLUMN queue_id text;

-- Make sender_fingerprint nullable for anonymous sends
ALTER TABLE public.relay_messages ALTER COLUMN sender_fingerprint DROP NOT NULL;

-- Index for fast queue lookups
CREATE INDEX idx_relay_messages_queue_id ON public.relay_messages(queue_id);
CREATE INDEX idx_pairwise_queues_owner ON public.pairwise_queues(owner_fingerprint);

-- Enable realtime for pairwise_queues
ALTER PUBLICATION supabase_realtime ADD TABLE public.pairwise_queues;

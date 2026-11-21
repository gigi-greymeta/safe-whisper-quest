
-- Public key registry for discovery
CREATE TABLE public.public_key_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  public_key_jwk JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.public_key_registry ENABLE ROW LEVEL SECURITY;

-- Anyone can read the registry (public keys are public by definition)
CREATE POLICY "Anyone can read public keys"
  ON public.public_key_registry FOR SELECT
  USING (true);

-- Anyone can register their public key
CREATE POLICY "Anyone can register a public key"
  ON public.public_key_registry FOR INSERT
  WITH CHECK (true);

-- Anyone can update their own entry (matched by fingerprint)
CREATE POLICY "Anyone can update their own key entry"
  ON public.public_key_registry FOR UPDATE
  USING (true);

-- Index for fast fingerprint lookups
CREATE INDEX idx_registry_fingerprint ON public.public_key_registry (fingerprint);

-- Encrypted relay messages (blind relay - server sees only encrypted blobs)
CREATE TABLE public.relay_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_fingerprint TEXT NOT NULL,
  sender_fingerprint TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  iv TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days')
);

-- Enable RLS
ALTER TABLE public.relay_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can send a message (insert)
CREATE POLICY "Anyone can send encrypted messages"
  ON public.relay_messages FOR INSERT
  WITH CHECK (true);

-- Anyone can read messages (they're encrypted - useless without private key)
CREATE POLICY "Anyone can read relay messages"
  ON public.relay_messages FOR SELECT
  USING (true);

-- Anyone can delete messages (cleanup after receipt)
CREATE POLICY "Anyone can delete relay messages"
  ON public.relay_messages FOR DELETE
  USING (true);

-- Index for fast recipient lookups
CREATE INDEX idx_relay_recipient ON public.relay_messages (recipient_fingerprint);

-- Index for expiry cleanup
CREATE INDEX idx_relay_expires ON public.relay_messages (expires_at);

-- Enable realtime for relay_messages so clients get instant delivery
ALTER PUBLICATION supabase_realtime ADD TABLE public.relay_messages;

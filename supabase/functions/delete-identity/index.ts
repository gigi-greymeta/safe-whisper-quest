// delete-identity — permanently removes everything the relay holds for one
// Phantom identity, after verifying proof of possession of its private key.
//
//   GET  → { publicKey }   server ECDH public key used to build the proof
//   POST { fingerprint, timestamp, proof } → { deleted: true }
//
// Secrets: DELETION_KEY_PRIVATE_JWK (see scripts/generate-deletion-key.mjs).
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyDeletionProof } from "../_shared/deletionProof.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const rawKey = Deno.env.get("DELETION_KEY_PRIVATE_JWK");
  if (!rawKey) return json({ error: "Deletion is not configured" }, 503);
  const serverPrivate = JSON.parse(rawKey) as JsonWebKey;

  if (req.method === "GET") {
    const { kty, crv, x, y } = serverPrivate;
    return json({ publicKey: { kty, crv, x, y } });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { fingerprint?: unknown; timestamp?: unknown; proof?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { fingerprint, timestamp, proof } = body;
  if (typeof fingerprint !== "string" || typeof timestamp !== "number" || typeof proof !== "string" || fingerprint.length > 512) {
    return json({ error: "Invalid request" }, 400);
  }

  if (!(await verifyDeletionProof(serverPrivate, fingerprint, timestamp, proof))) {
    return json({ error: "Proof rejected" }, 403);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: queues, error: qErr } = await admin
    .from("pairwise_queues")
    .select("queue_id")
    .eq("owner_fingerprint", fingerprint);
  if (qErr) return json({ error: "Lookup failed" }, 500);
  const queueIds = (queues ?? []).map((q) => q.queue_id);

  const steps = [
    queueIds.length ? admin.from("relay_messages").delete().in("queue_id", queueIds) : null,
    admin.from("relay_messages").delete().eq("recipient_fingerprint", fingerprint),
    admin.from("relay_messages").delete().eq("sender_fingerprint", fingerprint),
    admin.from("pairwise_queues").delete().eq("owner_fingerprint", fingerprint),
  ];
  for (const step of steps) {
    if (!step) continue;
    const { error } = await step;
    if (error) return json({ error: "Deletion failed, please retry" }, 500);
  }

  // Only the service role may scrub the registry. The database function nulls
  // every column except id and display_name, including future nullable fields.
  const { error: registryError } = await admin.rpc("scrub_public_key_registry_entry", {
    p_fingerprint: fingerprint,
  });
  if (registryError) return json({ error: "Deletion failed, please retry" }, 500);

  return json({ deleted: true });
});

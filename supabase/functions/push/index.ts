// push — register or unregister a phone for push notifications.
//
//   POST { action: "register", deviceSecret, platform, token, alertStyle, inboxes: [{ queueId, readToken }] }
//   POST { action: "unregister", deviceSecret }
//
// A phone can only subscribe to inboxes it owns: each inbox's read token must hash to the
// read_token_hash registered for it. The device is identified by SHA-256(deviceSecret), so
// only the phone holding the secret can change or remove its registration.
//
// Secrets: PUSH_TOKEN_KEY. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import { sealToken, sha256Hex } from "../_shared/pushTokens.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const HEX64 = /^[0-9a-f]{64}$/;
const STYLES = ["generic", "calculator", "notes", "weather"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const deviceSecret = typeof body.deviceSecret === "string" ? body.deviceSecret : "";
  if (!HEX64.test(deviceSecret)) return json({ error: "Invalid device" }, 400);
  const deviceHash = await sha256Hex(`phantom-push-device:${deviceSecret}`);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  if (body.action === "unregister") {
    await admin.from("push_devices").delete().eq("device_hash", deviceHash);
    return json({ ok: true });
  }
  if (body.action !== "register") return json({ error: "Unknown action" }, 400);

  const platform = body.platform === "ios" ? "ios" : body.platform === "android" ? "android" : null;
  const token = typeof body.token === "string" && body.token.length > 0 && body.token.length <= 1024 ? body.token : null;
  const alertStyle = STYLES.includes(String(body.alertStyle)) ? String(body.alertStyle) : "generic";
  const inboxes = Array.isArray(body.inboxes) ? body.inboxes.slice(0, 2000) : [];
  if (!platform || !token) return json({ error: "Invalid registration" }, 400);

  // Keep only inboxes this phone can prove it owns.
  const claimed = new Map<string, string>();
  for (const i of inboxes as { queueId?: unknown; readToken?: unknown }[]) {
    if (typeof i?.queueId === "string" && HEX64.test(i.queueId) && typeof i.readToken === "string" && i.readToken.length <= 128) {
      claimed.set(i.queueId, await sha256Hex(i.readToken));
    }
  }
  const owned: string[] = [];
  const ids = [...claimed.keys()];
  for (let n = 0; n < ids.length; n += 200) {
    const { data } = await admin.from("pairwise_queues").select("queue_id, read_token_hash").in("queue_id", ids.slice(n, n + 200));
    for (const row of data ?? []) if (row.read_token_hash && row.read_token_hash === claimed.get(row.queue_id)) owned.push(row.queue_id);
  }

  const { error } = await admin.from("push_devices").upsert({
    device_hash: deviceHash,
    platform,
    token_ciphertext: await sealToken(token),
    alert_style: alertStyle,
    updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: "Couldn't register" }, 500);

  await admin.from("push_subscriptions").delete().eq("device_hash", deviceHash);
  if (owned.length) {
    await admin.from("push_subscriptions").insert(owned.map((queue_id) => ({ queue_id, device_hash: deviceHash })));
  }
  return json({ ok: true, inboxes: owned.length });
});

// send-push — delivers queued, content-free push notifications.
//
// Woken by the push_on_relay_message trigger (via pg_net, with the x-push-secret header).
// Takes everything waiting in push_queue, collapses it to at most one push per phone per
// 30 seconds, and sends a generic alert through Firebase (Android) or APNs (iPhone). Tokens
// that Apple or Google report as dead are removed.
//
// Secrets:
//   PUSH_SEND_SECRET       shared with the database (Vault 'push_send_secret')
//   PUSH_TOKEN_KEY         decrypts stored push tokens (see _shared/pushTokens.ts)
//   FCM_SERVICE_ACCOUNT    Firebase service account JSON (Android)
//   APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_PRODUCTION ("true" for App Store/TestFlight)

import { createClient } from "npm:@supabase/supabase-js@2";
import { openToken } from "../_shared/pushTokens.ts";

const COLLAPSE_MS = 30_000;

/** What each style shows. Never message content, names or group names. */
const ALERTS: Record<string, { title: string; body: string; icon: string }> = {
  generic: { title: "Phantom", body: "New message", icon: "ic_stat_phantom" },
  calculator: { title: "Calculator", body: "You have a new reminder", icon: "ic_stat_calculator" },
  notes: { title: "Notes", body: "A note was updated", icon: "ic_stat_notes" },
  weather: { title: "Weather", body: "New weather update", icon: "ic_stat_weather" },
};

const b64url = (bytes: Uint8Array | string) => {
  const s = typeof bytes === "string" ? btoa(bytes) : btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const pemToDer = (pem: string) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));

async function signJwt(header: object, claims: object, key: CryptoKey, alg: AlgorithmIdentifier | EcdsaParams) {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = new Uint8Array(await crypto.subtle.sign(alg, key, new TextEncoder().encode(input)));
  return `${input}.${b64url(sig)}`;
}

// ─── Firebase (Android) ─────────────────────────────────────────────
let fcmAuth: { token: string; expires: number; project: string } | null = null;

async function fcmAccess() {
  if (fcmAuth && fcmAuth.expires > Date.now() + 60_000) return fcmAuth;
  const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "null");
  if (!sa) throw new Error("FCM_SERVICE_ACCOUNT is not set");
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    { alg: "RS256", typ: "JWT" },
    { iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
    key,
    { name: "RSASSA-PKCS1-v1_5" }
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`FCM auth failed: ${JSON.stringify(data)}`);
  fcmAuth = { token: data.access_token, expires: Date.now() + data.expires_in * 1000, project: sa.project_id };
  return fcmAuth;
}

/** Returns false if the token is dead and should be removed. */
async function sendFcm(token: string, style: string): Promise<boolean> {
  const auth = await fcmAccess();
  const a = ALERTS[style] ?? ALERTS.generic;
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.project}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: a.title, body: a.body },
        android: {
          priority: "high",
          collapse_key: "phantom",
          notification: { icon: a.icon, channel_id: "messages", tag: "phantom", visibility: "PRIVATE" },
        },
      },
    }),
  });
  if (res.ok) return true;
  const err = await res.text();
  return !(res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(err));
}

// ─── APNs (iPhone) ──────────────────────────────────────────────────
let apnsAuth: { jwt: string; issued: number } | null = null;

async function apnsJwt() {
  if (apnsAuth && Date.now() - apnsAuth.issued < 40 * 60_000) return apnsAuth.jwt;
  const p8 = Deno.env.get("APNS_KEY_P8");
  if (!p8) throw new Error("APNS_KEY_P8 is not set");
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(p8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const jwt = await signJwt(
    { alg: "ES256", kid: Deno.env.get("APNS_KEY_ID") },
    { iss: Deno.env.get("APNS_TEAM_ID"), iat: Math.floor(Date.now() / 1000) },
    key,
    { name: "ECDSA", hash: "SHA-256" }
  );
  apnsAuth = { jwt, issued: Date.now() };
  return jwt;
}

async function sendApns(token: string, style: string): Promise<boolean> {
  const a = ALERTS[style] ?? ALERTS.generic;
  const host = Deno.env.get("APNS_PRODUCTION") === "true" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await apnsJwt()}`,
      "apns-topic": Deno.env.get("APNS_BUNDLE_ID") ?? "au.com.greymeta.phantom",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": "phantom",
    },
    body: JSON.stringify({ aps: { alert: { title: a.title, body: a.body }, sound: "default", "thread-id": "phantom" } }),
  });
  if (res.ok) return true;
  return !(res.status === 410 || (res.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(await res.text())));
}

// ─── Handler ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const secret = Deno.env.get("PUSH_SEND_SECRET");
  if (!secret || req.headers.get("x-push-secret") !== secret) return new Response("Forbidden", { status: 403 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Take everything waiting; several envelopes for one phone become one push.
  const { data: queued } = await admin.from("push_queue").delete().gt("id", 0).select("device_hash");
  const devices = [...new Set((queued ?? []).map((r) => r.device_hash as string))];
  if (!devices.length) return new Response("ok");

  const { data: rows } = await admin.from("push_devices").select("*").in("device_hash", devices);
  let sent = 0;
  for (const d of rows ?? []) {
    if (d.last_sent_at && Date.now() - Date.parse(d.last_sent_at) < COLLAPSE_MS) continue;
    try {
      const token = await openToken(d.token_ciphertext);
      const alive = d.platform === "ios" ? await sendApns(token, d.alert_style) : await sendFcm(token, d.alert_style);
      if (!alive) {
        await admin.from("push_devices").delete().eq("device_hash", d.device_hash);
        continue;
      }
      await admin.from("push_devices").update({ last_sent_at: new Date().toISOString() }).eq("device_hash", d.device_hash);
      sent++;
    } catch (e) {
      console.error("[send-push]", d.platform, e instanceof Error ? e.message : e);
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "content-type": "application/json" } });
});

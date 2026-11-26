// Message requests: how someone who isn't in your contacts reaches you.
//
// Everyone has a request inbox whose address anyone can work out from their fingerprint.
// It's an owner-only relay v2 inbox: anyone can drop something in, only the owner (holding
// a token derived from their private key) can read or delete, and a content-free doorbell
// tells their phone to fetch.
//
// Each request is sealed twice:
//  - outer: to the recipient's identity key with a one-time key, so the server can't see
//    who sent it;
//  - inner: with the static key shared by sender and recipient, so the recipient knows the
//    sender really holds the identity they claim (nobody else can produce it).

import { base64ToPublicKey, deriveSharedKey, exportKeyPair, generateIdentityKeyPair, importPrivateKey, importPublicKey } from "@/crypto/keys";
import { deriveInboxSecrets, sha256Hex, type InboxSecrets } from "@/crypto/relayV2";
import { padPayload, unpadPayload } from "@/services/relay";
import { sendToInbox } from "@/services/relayV2";
import { fromB64, randomBytes, toB64 } from "@/lib/vanishing/crypto";

export type RequestBody =
  | { t: "contact"; name: string; preview?: string }
  | { t: "vanishing_invite"; name: string; groupId: string; groupName: string }
  | { t: "group_invite"; name: string; groupId: string; groupName: string };

export interface OpenedRequest {
  from: string;
  body: RequestBody;
  ts: number;
}

/** Requests older than this are ignored (stale or replayed). */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const OUTER_AAD = new TextEncoder().encode("phantom-request-outer-v1");
const INNER_AAD = new TextEncoder().encode("phantom-request-inner-v1");

export const requestInboxId = (fingerprint: string) => sha256Hex(`phantom-request-inbox-v1:${fingerprint}`);

export async function myRequestInbox(myFingerprint: string, myPrivateKey: JsonWebKey): Promise<{ id: string; secrets: InboxSecrets }> {
  const id = await requestInboxId(myFingerprint);
  return { id, secrets: await deriveInboxSecrets(myPrivateKey, id) };
}

async function aesEncrypt(key: CryptoKey, data: string, aad: Uint8Array) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, new TextEncoder().encode(data));
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

async function aesDecrypt(key: CryptoKey, iv: string, ct: string, aad: Uint8Array) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv), additionalData: aad }, key, fromB64(ct));
  return new TextDecoder().decode(pt);
}

export async function sealRequest(
  me: { fingerprint: string; privateKey: JsonWebKey },
  recipientFingerprint: string,
  body: RequestBody
): Promise<string> {
  const recipientKey = await importPublicKey(base64ToPublicKey(recipientFingerprint));
  const staticKey = await deriveSharedKey(await importPrivateKey(me.privateKey), recipientKey);
  const inner = await aesEncrypt(staticKey, JSON.stringify({ body, ts: Date.now(), to: recipientFingerprint }), INNER_AAD);
  const eph = await exportKeyPair(await generateIdentityKeyPair());
  const outerKey = await deriveSharedKey(await importPrivateKey(eph.privateKey), recipientKey);
  const outer = await aesEncrypt(outerKey, JSON.stringify({ from: me.fingerprint, ...inner }), OUTER_AAD);
  return JSON.stringify({ v: 1, epk: eph.publicKey, ...outer });
}

export async function openRequest(me: { fingerprint: string; privateKey: JsonWebKey }, raw: string): Promise<OpenedRequest | null> {
  try {
    const sealed = JSON.parse(raw) as { v: number; epk: JsonWebKey; iv: string; ct: string };
    if (sealed.v !== 1) return null;
    const myKey = await importPrivateKey(me.privateKey);
    const outer = JSON.parse(await aesDecrypt(await deriveSharedKey(myKey, await importPublicKey(sealed.epk)), sealed.iv, sealed.ct, OUTER_AAD)) as {
      from: string;
      iv: string;
      ct: string;
    };
    const senderKey = await importPublicKey(base64ToPublicKey(outer.from));
    const inner = JSON.parse(await aesDecrypt(await deriveSharedKey(myKey, senderKey), outer.iv, outer.ct, INNER_AAD)) as {
      body: RequestBody;
      ts: number;
      to: string;
    };
    if (inner.to !== me.fingerprint || Date.now() - inner.ts > MAX_AGE_MS || inner.ts - Date.now() > 5 * 60 * 1000) return null;
    const b = inner.body;
    const clean = (s: unknown, max: number) => String(s ?? "").slice(0, max);
    if (b?.t === "contact") return { from: outer.from, ts: inner.ts, body: { t: "contact", name: clean(b.name, 80), preview: b.preview ? clean(b.preview, 200) : undefined } };
    if ((b?.t === "vanishing_invite" || b?.t === "group_invite") && typeof b.groupId === "string") {
      return { from: outer.from, ts: inner.ts, body: { t: b.t, name: clean(b.name, 80), groupId: clean(b.groupId, 64), groupName: clean(b.groupName, 80) } };
    }
    return null;
  } catch {
    return null;
  }
}

/** Drop a request into someone's request inbox. Best effort; never throws. */
export async function sendRequest(me: { fingerprint: string; privateKey: JsonWebKey }, recipientFingerprint: string, body: RequestBody): Promise<void> {
  try {
    const payload = await sealRequest(me, recipientFingerprint, body);
    await sendToInbox(await requestInboxId(recipientFingerprint), padPayload(payload), "");
  } catch (e) {
    console.warn("[requests] send failed", e);
  }
}

export const unpadRequest = (padded: string) => unpadPayload(padded);

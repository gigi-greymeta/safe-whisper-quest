// Posting and reading vanishing-group messages, photos and videos.

import type { VanishingGroup } from "@/store/vanishingGroups";
import * as api from "@/lib/vanishing/api";
import {
  currentDay,
  decryptChunk,
  decryptPayload,
  encryptChunk,
  encryptPayload,
  importMediaKey,
  MEDIA_CHUNK,
  messageKey,
  newMediaKey,
  sign,
  verify,
} from "@/lib/vanishing/crypto";

/** 20 MB: about a minute of phone video. Larger files would be slow to encrypt and send. */
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

export type VanishingBody =
  | { kind: "text"; text: string }
  | { kind: "media"; mediaId: string; key: string; mime: string; name: string; size: number; chunks: number };

export interface VanishingMessage {
  id: string;
  from: string;
  fromName: string;
  ts: number;
  body: VanishingBody;
  expiresAt: number;
  createdAt: string;
}

const aad = (group: VanishingGroup, day: number) => `phantom-vg:${group.id}:${group.queueId}:${day}`;

export async function postToGroup(group: VanishingGroup, myFingerprint: string, body: VanishingBody): Promise<void> {
  const day = currentDay();
  const key = await messageKey(group.chain, day);
  if (!key) throw new Error("Group keys are out of date. Ask the admin to re-share the group.");
  const signed = JSON.stringify({ gid: group.id, from: myFingerprint, ts: Date.now(), body });
  const sig = await sign(group.mySign.priv, signed);
  const { iv, payload } = await encryptPayload(key, JSON.stringify({ signed, sig }), aad(group, day));
  await api.postMessage(group.queueId, day, iv, payload);
}

/**
 * Decrypt and verify one server row. Returns null for anything that doesn't decrypt,
 * isn't for this group, or isn't signed by a current member: those are never shown.
 */
export async function openMessage(group: VanishingGroup, row: api.ServerMessage): Promise<VanishingMessage | null> {
  try {
    const key = await messageKey(group.chain, row.key_day);
    if (!key) return null;
    const { signed, sig } = JSON.parse(await decryptPayload(key, row.iv, row.payload, aad(group, row.key_day))) as { signed: string; sig: string };
    const msg = JSON.parse(signed) as { gid: string; from: string; ts: number; body: VanishingBody };
    const sender = group.members.find((m) => m.fingerprint === msg.from);
    if (msg.gid !== group.id || !sender || !(await verify(sender.signPub, signed, sig))) return null;
    return {
      id: row.id,
      from: msg.from,
      fromName: sender.name,
      ts: msg.ts,
      body: msg.body,
      expiresAt: Date.parse(row.expires_at),
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}

const mediaAad = (group: VanishingGroup, mediaId: string, i: number) => `phantom-vg-media:${group.id}:${mediaId}:${i}`;

/** Encrypt a photo or video with its own key, upload it in chunks, then post the message pointing to it. */
export async function postMedia(group: VanishingGroup, myFingerprint: string, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  if (file.size > MAX_MEDIA_BYTES) throw new Error("That file is over 20 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { key, raw } = await newMediaKey();
  const mediaId = crypto.randomUUID();
  const chunks = Math.max(1, Math.ceil(bytes.length / MEDIA_CHUNK));
  for (let i = 0; i < chunks; i++) {
    const { iv, data } = await encryptChunk(key, bytes.subarray(i * MEDIA_CHUNK, (i + 1) * MEDIA_CHUNK), mediaAad(group, mediaId, i));
    await api.postMediaChunk(group.queueId, mediaId, i, iv, data);
    onProgress?.((i + 1) / chunks);
  }
  await postToGroup(group, myFingerprint, { kind: "media", mediaId, key: raw, mime: file.type, name: file.name.slice(0, 120), size: file.size, chunks });
}

/** Download and decrypt a photo or video into a temporary in-memory URL (never saved to the device). */
export async function openMedia(group: VanishingGroup, body: Extract<VanishingBody, { kind: "media" }>): Promise<string> {
  const key = await importMediaKey(body.key);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < body.chunks; i++) {
    const chunk = await api.fetchMediaChunk(group.queueId, body.mediaId, i);
    if (!chunk) throw new Error("This file has expired.");
    parts.push(await decryptChunk(key, chunk.iv, chunk.data, mediaAad(group, body.mediaId, i)));
  }
  return URL.createObjectURL(new Blob(parts, { type: body.mime }));
}

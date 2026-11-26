// Signed, encrypted group state for vanishing groups.
//
// What the server stores is opaque: a list of unlabelled sealed boxes plus one ciphertext.
//  - Each member gets a box sealed to their identity key (an ephemeral ECDH key agreed with
//    the public key their fingerprint encodes, then AES-GCM). It holds the group address,
//    chain key, a fresh state key and, for admins, the admin token. Boxes aren't labelled,
//    so the server can't tell whose they are; a phone tries each until one opens.
//  - The state itself (name, members, admins, invites) is encrypted with the state key and
//    signed by the admin who made the change. The signed part also commits to the address
//    and keys, so a box can't be swapped to point members somewhere else.
// The server, and anyone removed from the group, learns nothing: not the name, not who's in it.

import { base64ToPublicKey, deriveSharedKey, exportKeyPair, generateIdentityKeyPair, importPrivateKey, importPublicKey } from "@/crypto/keys";
import { fromB64, randomBytes, sha256Hex, sign, toB64, verify, type ChainState } from "@/lib/vanishing/crypto";
import type { VanishingMember } from "@/store/vanishingGroups";

export interface SealedBox {
  epk: JsonWebKey;
  iv: string;
  ct: string;
}

/** What each member gets sealed to them. */
export interface GroupSecrets {
  queueId: string;
  chain: ChainState;
  /** Decrypts the state document. */
  stateKey: string;
  /** Admins only. */
  adminToken?: string;
}

export interface GroupStateBody {
  v: 3;
  groupId: string;
  version: number;
  name: string;
  creator: string;
  admins: string[];
  members: VanishingMember[];
  invited: string[];
  updatedBy: string;
  ts: number;
  /** Commits to the address and chain key sealed in the boxes. */
  secretsDigest: string;
}

interface StoredState {
  boxes: SealedBox[];
  iv: string;
  ct: string;
}

const SEAL_AAD = new TextEncoder().encode("phantom-vg-seal-v3");
const STATE_AAD = new TextEncoder().encode("phantom-vg-state-v3");

const secretsDigest = (queueId: string, chain: ChainState) => sha256Hex(`${queueId}|${chain.day}|${chain.key}`);

export async function sealFor(fingerprint: string, secrets: GroupSecrets): Promise<SealedBox> {
  const eph = await exportKeyPair(await generateIdentityKeyPair());
  const key = await deriveSharedKey(await importPrivateKey(eph.privateKey), await importPublicKey(base64ToPublicKey(fingerprint)));
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: SEAL_AAD }, key, new TextEncoder().encode(JSON.stringify(secrets)));
  return { epk: eph.publicKey, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function unseal(box: SealedBox, myPrivateKey: JsonWebKey): Promise<GroupSecrets | null> {
  try {
    const key = await deriveSharedKey(await importPrivateKey(myPrivateKey), await importPublicKey(box.epk));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(box.iv), additionalData: SEAL_AAD }, key, fromB64(box.ct));
    return JSON.parse(new TextDecoder().decode(pt)) as GroupSecrets;
  } catch {
    return null;
  }
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Seal the secrets for every member (admins also get the admin token), encrypt and sign the state. */
export async function buildState(
  body: Omit<GroupStateBody, "v" | "ts" | "secretsDigest">,
  secrets: { queueId: string; chain: ChainState; adminToken: string },
  signPriv: JsonWebKey
): Promise<string> {
  const stateKeyRaw = randomBytes(32);
  const stateKey = toB64(stateKeyRaw);
  const boxes: SealedBox[] = [];
  for (const m of body.members) {
    boxes.push(
      await sealFor(m.fingerprint, {
        queueId: secrets.queueId,
        chain: secrets.chain,
        stateKey,
        ...(body.admins.includes(m.fingerprint) ? { adminToken: secrets.adminToken } : {}),
      })
    );
  }
  const full: GroupStateBody = { ...body, v: 3, ts: Date.now(), secretsDigest: await secretsDigest(secrets.queueId, secrets.chain) };
  const signed = JSON.stringify(full);
  const inner = new TextEncoder().encode(JSON.stringify({ signed, sig: await sign(signPriv, signed) }));
  const key = await crypto.subtle.importKey("raw", stateKeyRaw, "AES-GCM", false, ["encrypt"]);
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: STATE_AAD }, key, inner);
  const stored: StoredState = { boxes: shuffle(boxes), iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
  return JSON.stringify(stored);
}

/**
 * Open and check a stored state with this phone's identity key. `trustedAdmins` are the
 * people this phone already accepts as admins (from its current state, or the inviter when
 * joining); the signer must be one of them and still an admin. Returns null if this phone
 * isn't in the group, or anything doesn't check out.
 */
export async function readState(
  raw: string,
  groupId: string,
  trustedAdmins: string[],
  myPrivateKey: JsonWebKey
): Promise<{ body: GroupStateBody; secrets: GroupSecrets } | null> {
  try {
    const stored = JSON.parse(raw) as StoredState;
    let secrets: GroupSecrets | null = null;
    for (const box of stored.boxes ?? []) {
      secrets = await unseal(box, myPrivateKey);
      if (secrets) break;
    }
    if (!secrets) return null;
    const key = await crypto.subtle.importKey("raw", fromB64(secrets.stateKey), "AES-GCM", false, ["decrypt"]);
    const inner = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(stored.iv), additionalData: STATE_AAD }, key, fromB64(stored.ct));
    const { signed, sig } = JSON.parse(new TextDecoder().decode(inner)) as { signed: string; sig: string };
    const body = JSON.parse(signed) as GroupStateBody;
    if (body.v !== 3 || body.groupId !== groupId) return null;
    if (!trustedAdmins.includes(body.updatedBy) || !body.admins.includes(body.updatedBy)) return null;
    const signer = body.members.find((m) => m.fingerprint === body.updatedBy);
    if (!signer || !(await verify(signer.signPub, signed, sig))) return null;
    if (body.admins.length === 0 || !body.admins.every((a) => body.members.some((m) => m.fingerprint === a))) return null;
    if (body.secretsDigest !== (await secretsDigest(secrets.queueId, secrets.chain))) return null;
    return { body, secrets };
  } catch {
    return null;
  }
}

/** True if this stored state no longer opens for this phone (it has been removed). */
export async function lockedOut(raw: string, myPrivateKey: JsonWebKey): Promise<boolean> {
  try {
    const stored = JSON.parse(raw) as StoredState;
    for (const box of stored.boxes ?? []) if (await unseal(box, myPrivateKey)) return false;
    return true;
  } catch {
    return false;
  }
}

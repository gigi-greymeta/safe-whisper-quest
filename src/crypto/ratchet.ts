/**
 * Double Ratchet Protocol Implementation
 * 
 * Provides perfect forward secrecy: each message uses a unique key derived
 * from a ratcheting chain. Compromising a key reveals nothing about past messages.
 * 
 * State per contact:
 *  - rootKey: current root key (ratcheted on each DH exchange)
 *  - sendChainKey / recvChainKey: symmetric chain keys for send/recv
 *  - dhKeyPair: our current ephemeral DH key pair
 *  - peerPublicKey: their current ephemeral public key
 *  - sendMessageIndex / recvMessageIndex: counters
 *  - skippedKeys: map of (pubKey, index) -> messageKey for out-of-order messages
 */

import { generateExtractableEphemeralKeyPair as generateEphemeralKeyPair, exportKeyPair, importPublicKey, importPrivateKey } from "./keys";
import { kdfRootKey, kdfChainKey, importMessageKey, arrayBufferToBase64, base64ToArrayBuffer } from "./hkdf";

const MAX_SKIP = 100; // max skipped message keys to store

// ─── Serializable State ─────────────────────────────────────────────

export interface RatchetState {
  rootKey: string; // base64
  sendChainKey: string | null; // base64
  recvChainKey: string | null; // base64
  dhKeyPair: { publicKey: JsonWebKey; privateKey: JsonWebKey };
  peerPublicKey: JsonWebKey | null;
  sendMessageIndex: number;
  recvMessageIndex: number;
  previousSendCount: number; // number of messages sent before last DH ratchet
  skippedKeys: Record<string, string>; // "pubKeyB64:index" -> messageKeyB64
}

export interface RatchetHeader {
  ephemeralKey: JsonWebKey; // sender's current public DH key
  previousChainLength: number; // messages sent on previous sending chain
  messageIndex: number; // index within current sending chain
}

export interface RatchetMessage {
  header: RatchetHeader;
  ciphertext: string; // base64
  iv: string; // base64
}

// ─── Initialization ─────────────────────────────────────────────────

/**
 * Initialize ratchet as the party who INITIATED the contact (Alice).
 * Alice performs an initial DH with Bob's identity key to bootstrap.
 */
export async function initRatchetAsAlice(
  sharedSecret: ArrayBuffer,
  peerPublicKey: JsonWebKey
): Promise<RatchetState> {
  const dhPair = await generateEphemeralKeyPair();
  const exported = await exportKeyPair(dhPair);

  // Perform DH with peer's public key
  const peerKey = await importPublicKey(peerPublicKey);
  const privKey = await importPrivateKey(exported.privateKey);
  const dhOutput = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerKey },
    privKey,
    256
  );

  const [rootKey, sendChainKey] = await kdfRootKey(sharedSecret, dhOutput);

  return {
    rootKey: arrayBufferToBase64(rootKey),
    sendChainKey: arrayBufferToBase64(sendChainKey),
    recvChainKey: null,
    dhKeyPair: exported,
    peerPublicKey,
    sendMessageIndex: 0,
    recvMessageIndex: 0,
    previousSendCount: 0,
    skippedKeys: {},
  };
}

/**
 * Initialize ratchet as the party who RECEIVED the contact request (Bob).
 * Bob waits for Alice's first message to complete the DH ratchet.
 */
export async function initRatchetAsBob(
  sharedSecret: ArrayBuffer,
  ownKeyPair: { publicKey: JsonWebKey; privateKey: JsonWebKey }
): Promise<RatchetState> {
  return {
    rootKey: arrayBufferToBase64(sharedSecret),
    sendChainKey: null,
    recvChainKey: null,
    dhKeyPair: ownKeyPair,
    peerPublicKey: null,
    sendMessageIndex: 0,
    recvMessageIndex: 0,
    previousSendCount: 0,
    skippedKeys: {},
  };
}

// ─── Encrypt (Sending) ──────────────────────────────────────────────

export async function ratchetEncrypt(
  state: RatchetState,
  plaintext: string
): Promise<{ newState: RatchetState; message: RatchetMessage }> {
  if (!state.sendChainKey) {
    throw new Error("Send chain not initialized — waiting for first incoming message");
  }

  const [nextChainKey, messageKeyRaw] = await kdfChainKey(
    base64ToArrayBuffer(state.sendChainKey)
  );
  const messageKey = await importMessageKey(messageKeyRaw);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    messageKey,
    encoded
  );

  const header: RatchetHeader = {
    ephemeralKey: state.dhKeyPair.publicKey,
    previousChainLength: state.previousSendCount,
    messageIndex: state.sendMessageIndex,
  };

  const message: RatchetMessage = {
    header,
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer),
  };

  const newState: RatchetState = {
    ...state,
    sendChainKey: arrayBufferToBase64(nextChainKey),
    sendMessageIndex: state.sendMessageIndex + 1,
  };

  return { newState, message };
}

// ─── Decrypt (Receiving) ─────────────────────────────────────────────

export async function ratchetDecrypt(
  state: RatchetState,
  message: RatchetMessage
): Promise<{ newState: RatchetState; plaintext: string }> {
  // Check skipped keys first
  const skippedResult = await trySkippedKeys(state, message);
  if (skippedResult) return skippedResult;

  let currentState = { ...state, skippedKeys: { ...state.skippedKeys } };

  // If the header's ephemeral key differs from our stored peer key, perform DH ratchet
  if (!state.peerPublicKey || !jwkEqual(message.header.ephemeralKey, state.peerPublicKey)) {
    // Skip any remaining messages on the current receiving chain
    currentState = await skipMessages(currentState, message.header.previousChainLength);
    // Perform DH ratchet step
    currentState = await dhRatchetStep(currentState, message.header.ephemeralKey);
  }

  // Skip messages on the new receiving chain if needed
  currentState = await skipMessages(currentState, message.header.messageIndex);

  // Derive the message key
  if (!currentState.recvChainKey) {
    throw new Error("Receive chain not initialized");
  }

  const [nextChainKey, messageKeyRaw] = await kdfChainKey(
    base64ToArrayBuffer(currentState.recvChainKey)
  );
  const messageKey = await importMessageKey(messageKeyRaw);

  // Decrypt
  const iv = base64ToArrayBuffer(message.iv);
  const ciphertext = base64ToArrayBuffer(message.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    messageKey,
    ciphertext
  );

  const plaintext = new TextDecoder().decode(decrypted);

  const newState: RatchetState = {
    ...currentState,
    recvChainKey: arrayBufferToBase64(nextChainKey),
    recvMessageIndex: currentState.recvMessageIndex + 1,
  };

  return { newState, plaintext };
}

// ─── Internal Helpers ───────────────────────────────────────────────

async function dhRatchetStep(
  state: RatchetState,
  newPeerPublicKey: JsonWebKey
): Promise<RatchetState> {
  const peerKey = await importPublicKey(newPeerPublicKey);
  const privKey = await importPrivateKey(state.dhKeyPair.privateKey);

  // DH with our current private key and their new public key
  const dhOutput1 = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerKey },
    privKey,
    256
  );

  const [rootKey1, recvChainKey] = await kdfRootKey(
    base64ToArrayBuffer(state.rootKey),
    dhOutput1
  );

  // Generate new ephemeral key pair
  const newDhPair = await generateEphemeralKeyPair();
  const exported = await exportKeyPair(newDhPair);

  // DH with our new private key and their public key
  const newPrivKey = await importPrivateKey(exported.privateKey);
  const dhOutput2 = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerKey },
    newPrivKey,
    256
  );

  const [rootKey2, sendChainKey] = await kdfRootKey(rootKey1, dhOutput2);

  return {
    ...state,
    rootKey: arrayBufferToBase64(rootKey2),
    sendChainKey: arrayBufferToBase64(sendChainKey),
    recvChainKey: arrayBufferToBase64(recvChainKey),
    dhKeyPair: exported,
    peerPublicKey: newPeerPublicKey,
    previousSendCount: state.sendMessageIndex,
    sendMessageIndex: 0,
    recvMessageIndex: 0,
  };
}

async function skipMessages(
  state: RatchetState,
  until: number
): Promise<RatchetState> {
  if (!state.recvChainKey) return state;
  if (state.recvMessageIndex >= until) return state;
  if (until - state.recvMessageIndex > MAX_SKIP) {
    throw new Error("Too many skipped messages");
  }

  let chainKey = base64ToArrayBuffer(state.recvChainKey);
  const skippedKeys = { ...state.skippedKeys };
  let idx = state.recvMessageIndex;
  const peerKeyStr = state.peerPublicKey ? jwkFingerprint(state.peerPublicKey) : "unknown";

  while (idx < until) {
    const [nextChainKey, messageKeyRaw] = await kdfChainKey(chainKey);
    skippedKeys[`${peerKeyStr}:${idx}`] = arrayBufferToBase64(messageKeyRaw);
    chainKey = nextChainKey;
    idx++;
  }

  return {
    ...state,
    recvChainKey: arrayBufferToBase64(chainKey),
    recvMessageIndex: until,
    skippedKeys,
  };
}

async function trySkippedKeys(
  state: RatchetState,
  message: RatchetMessage
): Promise<{ newState: RatchetState; plaintext: string } | null> {
  const peerKeyStr = jwkFingerprint(message.header.ephemeralKey);
  const key = `${peerKeyStr}:${message.header.messageIndex}`;
  const messageKeyB64 = state.skippedKeys[key];
  if (!messageKeyB64) return null;

  const messageKey = await importMessageKey(base64ToArrayBuffer(messageKeyB64));
  const iv = base64ToArrayBuffer(message.iv);
  const ciphertext = base64ToArrayBuffer(message.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    messageKey,
    ciphertext
  );

  const plaintext = new TextDecoder().decode(decrypted);
  const newSkipped = { ...state.skippedKeys };
  delete newSkipped[key];

  return {
    newState: { ...state, skippedKeys: newSkipped },
    plaintext,
  };
}

function jwkEqual(a: JsonWebKey, b: JsonWebKey): boolean {
  return a.x === b.x && a.y === b.y;
}

function jwkFingerprint(jwk: JsonWebKey): string {
  return `${jwk.x || ""}:${jwk.y || ""}`.slice(0, 32);
}

// ─── Shared Secret from Identity Keys ───────────────────────────────

/**
 * Derive the initial shared secret from identity keys (X3DH simplified).
 * This is the bootstrap before the Double Ratchet begins.
 */
export async function deriveInitialSharedSecret(
  myPrivateKey: JsonWebKey,
  theirPublicKey: JsonWebKey
): Promise<ArrayBuffer> {
  const privKey = await importPrivateKey(myPrivateKey);
  const pubKey = await importPublicKey(theirPublicKey);
  return crypto.subtle.deriveBits(
    { name: "ECDH", public: pubKey },
    privKey,
    256
  );
}

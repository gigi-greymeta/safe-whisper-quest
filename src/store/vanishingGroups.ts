// Vanishing group state kept on this device: membership, keys and invites.
// Messages are never stored on the device; they're fetched from the server and
// held in memory while the chat is open. The whole record lives in the PIN vault
// (SENSITIVE_KEYS in vault.ts) and is wiped by a panic wipe.

import type { ChainState } from "@/lib/vanishing/crypto";

const KEY = "phantom_vanishing_groups";

export interface VanishingMember {
  fingerprint: string;
  name: string;
  /** Public signing key for this group; messages from them must verify against it. */
  signPub: JsonWebKey;
}

export interface VanishingGroup {
  id: string;
  name: string;
  /** The creator. */
  adminFingerprint: string;
  /** Everyone who can manage the group (the creator plus anyone made an admin). */
  admins: string[];
  /** Random 256-bit address on the server; knowing it is what lets you read and post. */
  queueId: string;
  chain: ChainState;
  /** Bumped by the admin on every membership change; older states are ignored. */
  version: number;
  members: VanishingMember[];
  mySign: { pub: JsonWebKey; priv: JsonWebKey };
  /** Admins only: secret that authorises managing the group on the server. */
  adminToken?: string;
  /** Fingerprints invited but not yet answered. */
  invited?: string[];
  /** Admins only: when this phone last told the server an admin is active. */
  lastPingAt?: number;
  createdAt: number;
}

export interface VanishingInvite {
  groupId: string;
  name: string;
  /** The admin who invited us (a contact). */
  adminFingerprint: string;
  adminName: string;
  receivedAt: number;
  /** Set when we accept, so the admin's reply can be matched to our signing key. */
  accepted?: { pub: JsonWebKey; priv: JsonWebKey };
}

interface Stored {
  groups: VanishingGroup[];
  invites: VanishingInvite[];
}

const listeners = new Set<() => void>();
export const onVanishingChange = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function loadVanishing(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as Stored;
      // Groups saved before several admins were possible had only the creator.
      data.groups = data.groups.map((g) => ({ ...g, admins: g.admins?.length ? g.admins : [g.adminFingerprint] }));
      return data;
    }
  } catch {
    // Corrupt: start empty rather than crash.
  }
  return { groups: [], invites: [] };
}

export function saveVanishing(data: Stored): void {
  localStorage.setItem(KEY, JSON.stringify(data));
  listeners.forEach((l) => l());
}

export function updateVanishing(fn: (data: Stored) => Stored): Stored {
  const next = fn(loadVanishing());
  saveVanishing(next);
  return next;
}

export const getVanishingGroup = (id: string) => loadVanishing().groups.find((g) => g.id === id);

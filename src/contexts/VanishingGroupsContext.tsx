// Vanishing groups (Premium to create): membership and invites.
//
// All membership traffic (invites, joins, the admin's group state with keys and the
// member list) travels as hidden control messages over the existing pairwise
// end-to-end encrypted channels, so the server never learns who is in which group.
// Only the admin's state is trusted, and only if it's newer than what we have and
// still lists us. Anyone invited can join, whatever their plan.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useCrypto } from "@/hooks/useCrypto";
import { getContacts } from "@/store/contacts";
import { getIdentity } from "@/store/identity";
import {
  loadVanishing,
  onVanishingChange,
  updateVanishing,
  getVanishingGroup,
  type VanishingGroup,
  type VanishingInvite,
  type VanishingMember,
} from "@/store/vanishingGroups";
import { newChain, newSigningKeys, pruneChain, randomHex, sha256Hex, type ChainState } from "@/lib/vanishing/crypto";
import * as api from "@/lib/vanishing/api";

interface VanishingGroupsValue {
  groups: VanishingGroup[];
  invites: VanishingInvite[];
  myFingerprint: string | null;
  createGroup: (name: string, contactIds: string[]) => Promise<VanishingGroup>;
  invite: (groupId: string, contactIds: string[]) => Promise<void>;
  acceptInvite: (groupId: string) => Promise<void>;
  declineInvite: (groupId: string) => Promise<void>;
  removeMember: (groupId: string, fingerprint: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
}

const Ctx = createContext<VanishingGroupsValue | null>(null);

const contactIdFor = (fingerprint: string) => getContacts().find((c) => c.publicKeyFingerprint === fingerprint)?.id;

/** Wipe every group this device administers from the server (used by the panic wipe). */
// eslint-disable-next-line react-refresh/only-export-components
export async function wipeAdministeredGroups(): Promise<void> {
  const mine = loadVanishing().groups.filter((g) => g.adminToken);
  await Promise.allSettled(mine.map((g) => api.deleteQueue(g.queueId, g.adminToken!)));
}

export function VanishingGroupsProvider({ children }: { children: React.ReactNode }) {
  const { sendControl, onControlMessage, state } = useCrypto();
  const [data, setData] = useState(loadVanishing);
  const myFingerprint = state.identity?.publicKeyFingerprint ?? null;

  useEffect(() => onVanishingChange(() => setData(loadVanishing())), []);

  // Throw away chain keys older than the 48-hour window, now and every hour.
  useEffect(() => {
    const prune = async () => {
      const current = loadVanishing();
      const groups = await Promise.all(current.groups.map(async (g) => ({ ...g, chain: await pruneChain(g.chain) })));
      updateVanishing((d) => ({ ...d, groups: d.groups.map((g) => groups.find((p) => p.id === g.id && p.version === g.version) ?? g) }));
    };
    void prune();
    const t = setInterval(() => void prune(), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [state.identity]);

  const send = useCallback(
    (fingerprint: string, body: Record<string, unknown>) => {
      const contactId = contactIdFor(fingerprint);
      if (!contactId) return Promise.resolve();
      return sendControl(contactId, body).catch((e) => console.error("[vanishing] send failed", e));
    },
    [sendControl]
  );

  const broadcastState = useCallback(
    async (group: VanishingGroup) => {
      const body = {
        __type: "vg_state",
        groupId: group.id,
        name: group.name,
        version: group.version,
        queueId: group.queueId,
        chain: group.chain,
        members: group.members,
        ts: Date.now(),
      };
      await Promise.all(group.members.filter((m) => m.fingerprint !== group.adminFingerprint).map((m) => send(m.fingerprint, body)));
    },
    [send]
  );

  const saveGroup = (group: VanishingGroup) =>
    updateVanishing((d) => ({ ...d, groups: [...d.groups.filter((g) => g.id !== group.id), group] }));

  const dropGroup = (groupId: string) =>
    updateVanishing((d) => ({ groups: d.groups.filter((g) => g.id !== groupId), invites: d.invites.filter((i) => i.groupId !== groupId) }));

  const invite = useCallback(
    async (groupId: string, contactIds: string[]) => {
      const group = getVanishingGroup(groupId);
      const me = getIdentity();
      if (!group?.adminToken || !me) return;
      const fps = getContacts().filter((c) => contactIds.includes(c.id)).map((c) => c.publicKeyFingerprint);
      saveGroup({ ...group, invited: Array.from(new Set([...(group.invited ?? []), ...fps])) });
      await Promise.all(
        fps.map((fp) => send(fp, { __type: "vg_invite", groupId, name: group.name, adminName: me.displayName, ts: Date.now() }))
      );
    },
    [send]
  );

  const createGroup = useCallback(
    async (name: string, contactIds: string[]) => {
      const me = getIdentity();
      if (!me) throw new Error("No identity");
      const queueId = randomHex(32);
      const adminToken = randomHex(32);
      await api.createQueue(queueId, await sha256Hex(adminToken));
      const mySign = await newSigningKeys();
      const group: VanishingGroup = {
        id: crypto.randomUUID(),
        name,
        adminFingerprint: me.publicKeyFingerprint,
        queueId,
        chain: newChain(),
        version: 1,
        members: [{ fingerprint: me.publicKeyFingerprint, name: me.displayName, signPub: mySign.pub }],
        mySign,
        adminToken,
        invited: [],
        createdAt: Date.now(),
      };
      saveGroup(group);
      await invite(group.id, contactIds);
      return group;
    },
    [invite]
  );

  const acceptInvite = useCallback(
    async (groupId: string) => {
      const inv = loadVanishing().invites.find((i) => i.groupId === groupId);
      const me = getIdentity();
      if (!inv || !me) return;
      const keys = inv.accepted ?? (await newSigningKeys());
      updateVanishing((d) => ({ ...d, invites: d.invites.map((i) => (i.groupId === groupId ? { ...i, accepted: keys } : i)) }));
      await send(inv.adminFingerprint, { __type: "vg_accept", groupId, name: me.displayName, signPub: keys.pub, ts: Date.now() });
    },
    [send]
  );

  const declineInvite = useCallback(
    async (groupId: string) => {
      const inv = loadVanishing().invites.find((i) => i.groupId === groupId);
      if (!inv) return;
      dropGroup(groupId);
      await send(inv.adminFingerprint, { __type: "vg_decline", groupId, ts: Date.now() });
    },
    [send]
  );

  /**
   * Remove a member: new address and new keys for everyone else, then the old
   * address and everything on it is wiped from the server. The removed person
   * keeps nothing they can use, and history from before the removal is cleared.
   */
  const removeMember = useCallback(
    async (groupId: string, fingerprint: string) => {
      const group = getVanishingGroup(groupId);
      if (!group?.adminToken || fingerprint === group.adminFingerprint) return;
      const queueId = randomHex(32);
      await api.createQueue(queueId, await sha256Hex(group.adminToken));
      const next: VanishingGroup = {
        ...group,
        queueId,
        chain: newChain(),
        version: group.version + 1,
        members: group.members.filter((m) => m.fingerprint !== fingerprint),
        invited: (group.invited ?? []).filter((f) => f !== fingerprint),
      };
      saveGroup(next);
      await broadcastState(next);
      await send(fingerprint, { __type: "vg_removed", groupId, ts: Date.now() });
      await api.deleteQueue(group.queueId, group.adminToken).catch((e) => console.error("[vanishing] old queue wipe failed", e));
    },
    [broadcastState, send]
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      const group = getVanishingGroup(groupId);
      if (!group?.adminToken) return;
      await api.deleteQueue(group.queueId, group.adminToken);
      dropGroup(groupId);
      await Promise.all(
        [...group.members.map((m) => m.fingerprint), ...(group.invited ?? [])]
          .filter((fp) => fp !== group.adminFingerprint)
          .map((fp) => send(fp, { __type: "vg_deleted", groupId, ts: Date.now() }))
      );
    },
    [send]
  );

  const leaveGroup = useCallback(
    async (groupId: string) => {
      const group = getVanishingGroup(groupId);
      if (!group || group.adminToken) return;
      dropGroup(groupId);
      await send(group.adminFingerprint, { __type: "vg_leave", groupId, ts: Date.now() });
    },
    [send]
  );

  // ─── Incoming control messages ───────────────────────────────────
  useEffect(() => {
    return onControlMessage((_contactId, from, body) => {
      const groupId = typeof body.groupId === "string" ? body.groupId : null;
      if (!groupId) return;
      const me = getIdentity();
      if (!me) return;
      const group = getVanishingGroup(groupId);
      const isAdmin = !!group?.adminToken;

      switch (body.__type) {
        case "vg_invite": {
          if (group || loadVanishing().invites.some((i) => i.groupId === groupId)) return;
          const inv: VanishingInvite = {
            groupId,
            name: String(body.name ?? "Group").slice(0, 80),
            adminFingerprint: from,
            adminName: String(body.adminName ?? "").slice(0, 80),
            receivedAt: Date.now(),
          };
          updateVanishing((d) => ({ ...d, invites: [...d.invites, inv] }));
          return;
        }
        case "vg_accept": {
          if (!group || !isAdmin || !(group.invited ?? []).includes(from) || !body.signPub) return;
          const member: VanishingMember = { fingerprint: from, name: String(body.name ?? "").slice(0, 80), signPub: body.signPub as JsonWebKey };
          const next: VanishingGroup = {
            ...group,
            version: group.version + 1,
            members: [...group.members.filter((m) => m.fingerprint !== from), member],
            invited: (group.invited ?? []).filter((f) => f !== from),
          };
          saveGroup(next);
          void broadcastState(next);
          return;
        }
        case "vg_decline": {
          if (group && isAdmin) saveGroup({ ...group, invited: (group.invited ?? []).filter((f) => f !== from) });
          return;
        }
        case "vg_leave": {
          if (group && isAdmin) void removeMember(groupId, from);
          return;
        }
        case "vg_state": {
          const inv = loadVanishing().invites.find((i) => i.groupId === groupId);
          const adminFp = group?.adminFingerprint ?? inv?.adminFingerprint;
          const mySign = group?.mySign ?? inv?.accepted;
          if (from !== adminFp || !mySign || isAdmin) return;
          const version = Number(body.version);
          if (group && version <= group.version) return;
          const members = body.members as VanishingMember[];
          // Only accept a state that still has us in it, with our own signing key.
          const meListed = members?.some((m) => m.fingerprint === me.publicKeyFingerprint && m.signPub?.x === mySign.pub.x);
          if (!meListed || typeof body.queueId !== "string" || !/^[0-9a-f]{64}$/.test(body.queueId)) return;
          saveGroup({
            id: groupId,
            name: String(body.name ?? "Group").slice(0, 80),
            adminFingerprint: from,
            queueId: body.queueId,
            chain: body.chain as ChainState,
            version,
            members,
            mySign,
            createdAt: group?.createdAt ?? Date.now(),
          });
          updateVanishing((d) => ({ ...d, invites: d.invites.filter((i) => i.groupId !== groupId) }));
          return;
        }
        case "vg_removed":
        case "vg_deleted": {
          const inv = loadVanishing().invites.find((i) => i.groupId === groupId);
          if (from === (group?.adminFingerprint ?? inv?.adminFingerprint)) dropGroup(groupId);
          return;
        }
      }
    });
  }, [onControlMessage, broadcastState, removeMember]);

  return (
    <Ctx.Provider
      value={{ groups: data.groups, invites: data.invites, myFingerprint, createGroup, invite, acceptInvite, declineInvite, removeMember, deleteGroup, leaveGroup }}
    >
      {children}
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVanishingGroups(): VanishingGroupsValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVanishingGroups must be used inside VanishingGroupsProvider");
  return ctx;
}

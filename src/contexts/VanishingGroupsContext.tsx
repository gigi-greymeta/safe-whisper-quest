// Vanishing groups (Premium to create): membership, admins and invites.
//
// The group's state (name, members, admins, invites) lives on the server encrypted and
// signed by the admin who last changed it, with the keys sealed separately to each member
// in unlabelled boxes (see lib/vanishing/state.ts), so the server can't read any of it. Any admin can change it; members only accept a
// change signed by someone they already trust as an admin. Invites still go over the
// pairwise end-to-end channels, because an invite has to come from someone you know.
//
// Content vanishes 48 hours after posting. The group itself lasts while at least one admin
// is active: admin phones check in with the server while the app is in use, and a group
// with no admin activity for 48 hours is removed with everything in it.

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
import { newChain, newSigningKeys, pruneChain, randomHex, sha256Hex } from "@/lib/vanishing/crypto";
import { buildState, lockedOut, readState, type GroupStateBody } from "@/lib/vanishing/state";
import * as api from "@/lib/vanishing/api";
import { sendRequest } from "@/lib/requests";
import { base64ToPublicKey } from "@/crypto/keys";

const STATE_POLL_MS = 20_000;
/** How often an admin's phone tells the server an admin is still active. */
const ADMIN_PING_MS = 60 * 60 * 1000;

export type GroupEndReason = "removed" | "ended";

interface VanishingGroupsValue {
  groups: VanishingGroup[];
  invites: VanishingInvite[];
  myFingerprint: string | null;
  /** Groups that ended while the app was open, to explain why they disappeared. */
  ended: { name: string; reason: GroupEndReason }[];
  dismissEnded: () => void;
  isAdmin: (group: VanishingGroup) => boolean;
  createGroup: (name: string, contactIds: string[]) => Promise<VanishingGroup>;
  invite: (groupId: string, contactIds: string[]) => Promise<void>;
  acceptInvite: (groupId: string) => Promise<void>;
  declineInvite: (groupId: string) => Promise<void>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  setAdmin: (groupId: string, fingerprint: string, admin: boolean) => Promise<void>;
  removeMember: (groupId: string, fingerprint: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  refresh: (groupId?: string) => Promise<void>;
}

const Ctx = createContext<VanishingGroupsValue | null>(null);

const contactIdFor = (fingerprint: string) => getContacts().find((c) => c.publicKeyFingerprint === fingerprint)?.id;

/**
 * When this phone is wiped: clear the chat history of every group it runs, but keep the
 * groups themselves for their members (other admins can carry on; with none left, the
 * group is removed after 48 hours). Only "Delete group for everyone" removes one at once.
 */
// eslint-disable-next-line react-refresh/only-export-components
export async function wipeAdministeredGroups(): Promise<void> {
  const mine = loadVanishing().groups.filter((g) => g.adminToken);
  await Promise.allSettled(mine.map((g) => api.clearQueue(g.queueId, g.adminToken!)));
}

const saveGroup = (group: VanishingGroup) =>
  updateVanishing((d) => ({ ...d, groups: [...d.groups.filter((g) => g.id !== group.id), group] }));

const dropGroup = (groupId: string) =>
  updateVanishing((d) => ({ groups: d.groups.filter((g) => g.id !== groupId), invites: d.invites.filter((i) => i.groupId !== groupId) }));

export function VanishingGroupsProvider({ children }: { children: React.ReactNode }) {
  const { sendControl, onControlMessage, state, addContactFromRegistry } = useCrypto();
  const [data, setData] = useState(loadVanishing);
  const [ended, setEnded] = useState<{ name: string; reason: GroupEndReason }[]>([]);
  const myFingerprint = state.identity?.publicKeyFingerprint ?? null;

  useEffect(() => onVanishingChange(() => setData(loadVanishing())), []);

  const send = useCallback(
    (fingerprint: string, body: Record<string, unknown>) => {
      const contactId = contactIdFor(fingerprint);
      if (!contactId) return Promise.resolve();
      return sendControl(contactId, body).catch((e) => console.error("[vanishing] send failed", e));
    },
    [sendControl]
  );

  const isAdmin = useCallback(
    (g: VanishingGroup) => !!g.adminToken && !!myFingerprint && g.admins.includes(myFingerprint),
    [myFingerprint]
  );

  /**
   * Admin: publish a change. `rotate` moves the group to a new address and keys (after
   * removing someone) and leaves a forwarding note at the old address for those who
   * remain; `newToken` replaces the admin token (after demoting an admin).
   */
  const publish = useCallback(
    async (
      group: VanishingGroup,
      changes: Partial<Pick<GroupStateBody, "name" | "admins" | "members" | "invited">>,
      opts: { rotate?: boolean; newToken?: boolean } = {}
    ) => {
      const me = getIdentity();
      if (!me || !group.adminToken) throw new Error("Only admins can change the group.");
      const body = {
        groupId: group.id,
        version: group.version + 1,
        name: changes.name ?? group.name,
        creator: group.adminFingerprint,
        admins: changes.admins ?? group.admins,
        members: changes.members ?? group.members,
        invited: changes.invited ?? group.invited ?? [],
        updatedBy: me.publicKeyFingerprint,
      };
      let queueId = group.queueId;
      let chain = group.chain;
      let adminToken = group.adminToken;
      if (opts.rotate) {
        queueId = randomHex(32);
        chain = newChain();
        adminToken = randomHex(32);
        await api.createQueue(queueId, await sha256Hex(adminToken));
      } else if (opts.newToken) {
        adminToken = randomHex(32);
      }
      const signed = await buildState(body, { queueId, chain, adminToken }, group.mySign.priv);
      if (opts.rotate) {
        await api.setState(queueId, adminToken, signed);
        // Forwarding note at the old address, sealed only to the people who remain; then
        // clear the old address's history.
        await api.setState(group.queueId, group.adminToken, signed);
        await api.clearQueue(group.queueId, group.adminToken).catch(() => {});
      } else {
        const ok = await api.setState(queueId, group.adminToken, signed, opts.newToken ? await sha256Hex(adminToken) : undefined);
        if (!ok) throw new Error("The server didn't accept the change. You may no longer be an admin.");
      }
      const next: VanishingGroup = {
        ...group,
        name: body.name,
        admins: body.admins,
        members: body.members,
        invited: body.invited,
        version: body.version,
        queueId,
        chain,
        adminToken,
        lastPingAt: Date.now(),
      };
      saveGroup(next);
      return next;
    },
    []
  );

  /** Fetch and apply the latest state for one group (also how members learn of changes). */
  const syncGroup = useCallback(
    async (group: VanishingGroup) => {
      const me = getIdentity();
      if (!me) return;
      let res: { exists: boolean; state: string | null };
      try {
        res = await api.getState(group.queueId);
      } catch {
        return; // offline: try again later
      }
      if (!res.exists) {
        dropGroup(group.id);
        setEnded((e) => [...e, { name: group.name, reason: "ended" }]);
        return;
      }
      const amAdmin = !!group.adminToken && group.admins.includes(me.publicKeyFingerprint);
      if (!res.state) {
        // Group made before shared state existed: its admin publishes the first one.
        if (amAdmin) await publish(group, {}).catch(() => {});
        return;
      }
      const opened = await readState(res.state, group.id, group.admins, me.keyPair.privateKey);
      if (!opened && (await lockedOut(res.state, me.keyPair.privateKey))) {
        // The latest state isn't sealed to us any more: we were removed.
        dropGroup(group.id);
        setEnded((e) => [...e, { name: group.name, reason: "removed" }]);
        return;
      }
      const body = opened?.body;
      if (!opened || !body || body.version <= group.version) {
        // Nothing new: an admin still checks in now and then so the group isn't removed.
        if (amAdmin && Date.now() - (group.lastPingAt ?? 0) > ADMIN_PING_MS) {
          if (await api.adminPing(group.queueId, group.adminToken!).catch(() => false)) saveGroup({ ...group, lastPingAt: Date.now() });
        }
        return;
      }
      if (!body.members.some((m) => m.fingerprint === me.publicKeyFingerprint)) {
        dropGroup(group.id);
        setEnded((e) => [...e, { name: group.name, reason: "removed" }]);
        return;
      }
      const secrets = opened.secrets;
      saveGroup({
        ...group,
        name: body.name,
        adminFingerprint: body.creator,
        admins: body.admins,
        members: body.members,
        invited: body.invited,
        version: body.version,
        queueId: secrets.queueId,
        chain: await pruneChain(secrets.chain),
        adminToken: body.admins.includes(me.publicKeyFingerprint) ? secrets.adminToken : undefined,
      });
    },
    [publish]
  );

  const refresh = useCallback(
    async (groupId?: string) => {
      const groups = loadVanishing().groups.filter((g) => !groupId || g.id === groupId);
      for (const g of groups) await syncGroup(g);
    },
    [syncGroup]
  );

  // Keep every group in step, check in as admin, and drop chain keys older than 48 hours.
  useEffect(() => {
    if (!state.identity) return;
    void refresh();
    const t = setInterval(() => void refresh(), STATE_POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [state.identity, refresh]);

  const invite = useCallback(
    async (groupId: string, contactIds: string[]) => {
      const group = getVanishingGroup(groupId);
      const me = getIdentity();
      if (!group || !me || !isAdmin(group)) return;
      const fps = getContacts()
        .filter((c) => contactIds.includes(c.id) && !group.members.some((m) => m.fingerprint === c.publicKeyFingerprint))
        .map((c) => c.publicKeyFingerprint);
      if (fps.length === 0) return;
      await publish(group, { invited: Array.from(new Set([...(group.invited ?? []), ...fps])) });
      const sender = { fingerprint: me.publicKeyFingerprint, privateKey: me.keyPair.privateKey };
      await Promise.all(
        fps.flatMap((fp) => [
          // Directly if they have us as a contact, and through their request inbox in case they don't.
          send(fp, { __type: "vg_invite", groupId, name: group.name, adminName: me.displayName, ts: Date.now() }),
          sendRequest(sender, fp, { t: "vanishing_invite", name: me.displayName, groupId, groupName: group.name }),
        ])
      );
    },
    [isAdmin, publish, send]
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
        name: name.trim().slice(0, 80),
        adminFingerprint: me.publicKeyFingerprint,
        admins: [me.publicKeyFingerprint],
        queueId,
        chain: newChain(),
        version: 0,
        members: [{ fingerprint: me.publicKeyFingerprint, name: me.displayName, signPub: mySign.pub }],
        mySign,
        adminToken,
        invited: [],
        createdAt: Date.now(),
      };
      const published = await publish(group, {});
      await invite(published.id, contactIds);
      return getVanishingGroup(published.id) ?? published;
    },
    [invite, publish]
  );

  const acceptInvite = useCallback(
    async (groupId: string) => {
      const inv = loadVanishing().invites.find((i) => i.groupId === groupId);
      const me = getIdentity();
      if (!inv || !me) return;
      // Joining needs the inviter as a contact (the join goes over your private channel with them).
      if (!contactIdFor(inv.adminFingerprint)) {
        await addContactFromRegistry(inv.adminFingerprint, inv.adminName || "Group admin", base64ToPublicKey(inv.adminFingerprint));
      }
      const keys = inv.accepted ?? (await newSigningKeys());
      updateVanishing((d) => ({ ...d, invites: d.invites.map((i) => (i.groupId === groupId ? { ...i, accepted: keys } : i)) }));
      await send(inv.adminFingerprint, { __type: "vg_accept", groupId, name: me.displayName, signPub: keys.pub, ts: Date.now() });
    },
    [send, addContactFromRegistry]
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

  const renameGroup = useCallback(
    async (groupId: string, name: string) => {
      const group = getVanishingGroup(groupId);
      const trimmed = name.trim().slice(0, 80);
      if (!group || !trimmed || !isAdmin(group)) return;
      await publish(group, { name: trimmed });
    },
    [isAdmin, publish]
  );

  /** Make someone an admin, or take it away (which also replaces the admin token). */
  const setAdmin = useCallback(
    async (groupId: string, fingerprint: string, admin: boolean) => {
      const group = getVanishingGroup(groupId);
      if (!group || !isAdmin(group) || !group.members.some((m) => m.fingerprint === fingerprint)) return;
      const admins = admin ? Array.from(new Set([...group.admins, fingerprint])) : group.admins.filter((a) => a !== fingerprint);
      if (admins.length === 0) throw new Error("A group needs at least one admin.");
      await publish(group, { admins }, { newToken: !admin });
    },
    [isAdmin, publish]
  );

  /**
   * Remove a member: new address and keys for everyone else, a forwarding note sealed only
   * to them, and the old address's history wiped. The removed person keeps nothing usable.
   */
  const removeMember = useCallback(
    async (groupId: string, fingerprint: string) => {
      const group = getVanishingGroup(groupId);
      if (!group || !isAdmin(group) || !group.members.some((m) => m.fingerprint === fingerprint)) return;
      const admins = group.admins.filter((a) => a !== fingerprint);
      if (admins.length === 0) throw new Error("A group needs at least one admin.");
      await publish(
        group,
        {
          members: group.members.filter((m) => m.fingerprint !== fingerprint),
          admins,
          invited: (group.invited ?? []).filter((f) => f !== fingerprint),
        },
        { rotate: true }
      );
    },
    [isAdmin, publish]
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      const group = getVanishingGroup(groupId);
      if (!group || !isAdmin(group)) return;
      await api.deleteQueue(group.queueId, group.adminToken!);
      dropGroup(groupId);
      // Members notice the group is gone on their next check; contacts hear straight away.
      await Promise.all(
        [...group.members.map((m) => m.fingerprint), ...(group.invited ?? [])]
          .filter((fp) => fp !== myFingerprint)
          .map((fp) => send(fp, { __type: "vg_deleted", groupId, ts: Date.now() }))
      );
    },
    [isAdmin, myFingerprint, send]
  );

  /** Leave. An admin removes themselves (the group needs another admin first); a member asks the admins. */
  const leaveGroup = useCallback(
    async (groupId: string) => {
      const group = getVanishingGroup(groupId);
      if (!group || !myFingerprint) return;
      if (isAdmin(group)) {
        const others = group.admins.filter((a) => a !== myFingerprint);
        if (others.length === 0 && group.members.length > 1) {
          throw new Error("Make someone else an admin before you leave, or delete the group.");
        }
        if (others.length > 0) await removeMember(groupId, myFingerprint);
        else await api.deleteQueue(group.queueId, group.adminToken!).catch(() => {});
      } else {
        await Promise.all(group.admins.map((fp) => send(fp, { __type: "vg_leave", groupId, ts: Date.now() })));
      }
      dropGroup(groupId);
    },
    [isAdmin, myFingerprint, removeMember, send]
  );

  // ─── Incoming control messages (pairwise, from contacts) ──────────
  useEffect(() => {
    return onControlMessage((_contactId, from, body) => {
      const groupId = typeof body.groupId === "string" ? body.groupId : null;
      const me = getIdentity();
      if (!groupId || !me) return;
      const group = getVanishingGroup(groupId);
      const amAdmin = !!group && isAdmin(group);

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
          if (!group || !amAdmin || !(group.invited ?? []).includes(from) || !body.signPub) return;
          const member: VanishingMember = { fingerprint: from, name: String(body.name ?? "").slice(0, 80), signPub: body.signPub as JsonWebKey };
          void publish(group, {
            members: [...group.members.filter((m) => m.fingerprint !== from), member],
            invited: (group.invited ?? []).filter((f) => f !== from),
          })
            .then((next) => send(from, { __type: "vg_welcome", groupId, queueId: next.queueId, ts: Date.now() }))
            .catch((e) => console.error("[vanishing] add member failed", e));
          return;
        }
        case "vg_decline": {
          if (group && amAdmin) void publish(group, { invited: (group.invited ?? []).filter((f) => f !== from) }).catch(() => {});
          return;
        }
        case "vg_leave": {
          if (group && amAdmin) void removeMember(groupId, from).catch(() => {});
          return;
        }
        case "vg_welcome": {
          // The inviter tells us where the group is. The signed state there must come from
          // them and must list us with our own signing key.
          const inv = loadVanishing().invites.find((i) => i.groupId === groupId);
          if (!inv?.accepted || from !== inv.adminFingerprint || typeof body.queueId !== "string" || !/^[0-9a-f]{64}$/.test(body.queueId)) return;
          const queueId = body.queueId;
          const accepted = inv.accepted;
          void (async () => {
            const res = await api.getState(queueId).catch(() => null);
            if (!res?.state) return;
            const opened = await readState(res.state, groupId, [inv.adminFingerprint], me.keyPair.privateKey);
            const st = opened?.body;
            const meListed = st?.members.find((m) => m.fingerprint === me.publicKeyFingerprint);
            if (!opened || !st || meListed?.signPub?.x !== accepted.pub.x) return;
            const secrets = opened.secrets;
            saveGroup({
              id: groupId,
              name: st.name,
              adminFingerprint: st.creator,
              admins: st.admins,
              queueId: secrets.queueId,
              chain: secrets.chain,
              version: st.version,
              members: st.members,
              invited: st.invited,
              mySign: accepted,
              adminToken: st.admins.includes(me.publicKeyFingerprint) ? secrets.adminToken : undefined,
              createdAt: Date.now(),
            });
            updateVanishing((d) => ({ ...d, invites: d.invites.filter((i) => i.groupId !== groupId) }));
          })();
          return;
        }
        case "vg_deleted": {
          const inv = loadVanishing().invites.find((i) => i.groupId === groupId);
          const trusted = group ? group.admins : inv ? [inv.adminFingerprint] : [];
          if (trusted.includes(from)) {
            if (group) setEnded((e) => [...e, { name: group.name, reason: "ended" }]);
            dropGroup(groupId);
          }
          return;
        }
      }
    });
  }, [onControlMessage, isAdmin, publish, removeMember, send]);

  return (
    <Ctx.Provider
      value={{
        groups: data.groups,
        invites: data.invites,
        myFingerprint,
        ended,
        dismissEnded: () => setEnded([]),
        isAdmin,
        createGroup,
        invite,
        acceptInvite,
        declineInvite,
        renameGroup,
        setAdmin,
        removeMember,
        deleteGroup,
        leaveGroup,
        refresh,
      }}
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

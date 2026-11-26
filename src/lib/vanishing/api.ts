// Server calls for vanishing groups. Only the vg_* functions in
// supabase/migrations/20261123000000_vanishing_groups.sql are reachable; the
// tables themselves are closed to the app.

import { supabase } from "@/integrations/supabase/client";

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
// These functions aren't in the generated Supabase types yet.
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface ServerMessage {
  id: string;
  key_day: number;
  iv: string;
  payload: string;
  created_at: string;
  expires_at: string;
}

export const createQueue = (queueId: string, adminTokenHash: string) =>
  call<void>("vg_create_queue", { p_queue_id: queueId, p_admin_token_hash: adminTokenHash });

export const postMessage = (queueId: string, keyDay: number, iv: string, payload: string) =>
  call<string>("vg_post_message", { p_queue_id: queueId, p_key_day: keyDay, p_iv: iv, p_payload: payload });

export const fetchMessages = (queueId: string, since?: string) =>
  call<ServerMessage[]>("vg_fetch_messages", { p_queue_id: queueId, p_since: since ?? null });

export const postMediaChunk = (queueId: string, mediaId: string, index: number, iv: string, data: string) =>
  call<void>("vg_post_media_chunk", { p_queue_id: queueId, p_media_id: mediaId, p_chunk_index: index, p_iv: iv, p_data: data });

export async function fetchMediaChunk(queueId: string, mediaId: string, index: number): Promise<{ iv: string; data: string } | null> {
  const rows = await call<{ iv: string; data: string }[]>("vg_fetch_media_chunk", { p_queue_id: queueId, p_media_id: mediaId, p_chunk_index: index });
  return rows[0] ?? null;
}

/** Admin only: write the signed group state; optionally replace the admin token. */
export const setState = (queueId: string, adminToken: string, state: string, newAdminTokenHash?: string) =>
  call<boolean>("vg_set_state", { p_queue_id: queueId, p_admin_token: adminToken, p_state: state, p_new_admin_token_hash: newAdminTokenHash ?? null });

/** Whether the group still exists on the server, and its signed state (null before the first write). */
export async function getState(queueId: string): Promise<{ exists: boolean; state: string | null }> {
  const rows = await call<{ queue_exists: boolean; state: string | null }[]>("vg_get_state", { p_queue_id: queueId });
  return { exists: !!rows[0]?.queue_exists, state: rows[0]?.state ?? null };
}

/** Admin only: "still active", so the group isn't removed after 48 hours without an admin. */
export const adminPing = (queueId: string, adminToken: string) =>
  call<boolean>("vg_admin_ping", { p_queue_id: queueId, p_admin_token: adminToken });

/** Admin only: wipe a group's messages and media but keep the group itself. */
export const clearQueue = (queueId: string, adminToken: string) =>
  call<boolean>("vg_clear_queue", { p_queue_id: queueId, p_admin_token: adminToken });

export const deleteQueue = (queueId: string, adminToken: string) =>
  call<boolean>("vg_delete_queue", { p_queue_id: queueId, p_admin_token: adminToken });

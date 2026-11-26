// Reporting abusive content. Chats are end-to-end encrypted, so nobody at Phantom can
// see them; a report carries only what the reporter chooses to include. Reports go to
// an insert-only table (see supabase/migrations/20261126000000_abuse_reports.sql) that
// the Phantom team reviews.

import { supabase } from "@/integrations/supabase/client";

export const REPORT_REASONS = [
  "Spam or scam",
  "Harassment or threats",
  "Sexual content",
  "Violence or self-harm",
  "Illegal content",
  "Something else",
] as const;

export interface AbuseReport {
  context: "chat" | "group" | "vanishing_group";
  reportedFingerprint: string;
  reportedName: string;
  reason: (typeof REPORT_REASONS)[number];
  details: string;
  /** Messages the reporter chose to include (plain text, newest last). */
  messages: { from: string; text: string; at: number }[];
  /** Optional way to reach the reporter about the outcome. */
  contact?: string;
}

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;

export async function submitReport(r: AbuseReport): Promise<void> {
  const { error } = await rpc("submit_abuse_report", {
    p_context: r.context,
    p_reported_fingerprint: r.reportedFingerprint.slice(0, 200),
    p_reported_name: r.reportedName.slice(0, 80),
    p_reason: r.reason,
    p_details: r.details.slice(0, 2000),
    p_messages: r.messages.slice(-10).map((m) => ({ ...m, text: m.text.slice(0, 2000) })),
    p_contact: r.contact?.slice(0, 200) || null,
  });
  if (error) throw new Error("Couldn't send the report. Check your connection and try again.");
}

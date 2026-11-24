import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = vi.hoisted(() => ({
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  inserts: [] as Array<Record<string, unknown>>,
  ready: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args });
      if (fn === "relay_inbox_ready") return { data: calls.ready, error: null };
      return { data: null, error: null };
    },
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        calls.inserts.push(row);
        return { error: null };
      },
    }),
  },
}));

import { sendRelayMessage } from "@/services/relay";
import { setOutboxRoute } from "@/services/relayV2";

const V1 = "0123456789abcdef0123456789abcdef";
const V2 = "a".repeat(64);

describe("relay routing", () => {
  beforeEach(() => {
    calls.rpc.length = 0;
    calls.inserts.length = 0;
  });

  it("uses v1 while the contact's app hasn't registered a v2 inbox", async () => {
    calls.ready = false;
    setOutboxRoute(V1, V2);
    await sendRelayMessage(V1, "ciphertext", "iv");
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0].queue_id).toBe(V1);
    expect(calls.rpc.map((c) => c.fn)).toEqual(["relay_inbox_ready"]);
  });

  it("switches to the owner-only v2 inbox once the contact has one", async () => {
    calls.ready = true;
    setOutboxRoute(V1, V2.replace(/a$/, "b"));
    await sendRelayMessage(V1, "ciphertext", "iv");
    const send = calls.rpc.find((c) => c.fn === "relay_send");
    expect(send?.args.p_queue_id).toBe(V2.replace(/a$/, "b"));
    expect(String(send?.args.p_payload)).toContain("ciphertext");
    expect(calls.inserts).toHaveLength(0);
  });

  it("a contact without a v2 route always uses v1", async () => {
    await sendRelayMessage("fedcba9876543210fedcba9876543210", "ciphertext", "iv");
    expect(calls.inserts).toHaveLength(1);
    expect(calls.rpc).toHaveLength(0);
  });
});

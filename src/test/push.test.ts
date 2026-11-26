import { describe, it, expect, vi } from "vitest";

vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/relayV2", () => ({ listMyInboxes: () => [] }));
vi.mock("@/lib/disguise", () => ({ getDisguise: async () => "default" }));

import { alertStyleFor } from "@/lib/push";

describe("push alert style", () => {
  it("is off until turned on", () => {
    expect(alertStyleFor({ enabled: false, whileDisguised: "disguise" }, "default")).toBeNull();
  });
  it("is the generic 'New message' when not disguised", () => {
    expect(alertStyleFor({ enabled: true, whileDisguised: "off" }, "default")).toBe("generic");
  });
  it("follows the person's choice while disguised", () => {
    expect(alertStyleFor({ enabled: true, whileDisguised: "off" }, "calculator")).toBeNull();
    expect(alertStyleFor({ enabled: true, whileDisguised: "disguise" }, "calculator")).toBe("calculator");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ─── Relay: delivered messages are deleted from the server ─────────────────

const deleted: string[] = [];
let deleteError: { message: string } | null = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({ data: null, error: null }),
    from: (table: string) => ({
      delete: () => ({
        eq: async (column: string, value: string) => {
          if (table === "relay_messages" && column === "id") deleted.push(value);
          return { error: deleteError };
        },
      }),
    }),
  },
}));

import { acknowledgeRelayMessage, deleteRelayMessage } from "@/services/relay";
import { generateIdentityKeyPair, exportKeyPair, publicKeyToBase64, registryKeyMatchesFingerprint } from "@/crypto/keys";
import { isValidPin, setPin, setPanicPin, MIN_PIN_LENGTH } from "@/store/lock";
import WeatherDecoy from "@/components/WeatherDecoy";

describe("relay delivery acknowledgement", () => {
  beforeEach(() => {
    deleted.length = 0;
    deleteError = null;
  });

  it("deletes the delivered message's row from relay_messages", async () => {
    await acknowledgeRelayMessage("msg-1");
    expect(deleted).toEqual(["msg-1"]);
  });

  it("never throws when the delete fails, so delivery isn't interrupted", async () => {
    deleteError = { message: "network down" };
    await expect(acknowledgeRelayMessage("msg-2")).resolves.toBeUndefined();
    await expect(deleteRelayMessage("msg-3")).rejects.toThrow(/network down/);
  });
});

describe("directory key integrity", () => {
  it("accepts a key that encodes to its fingerprint", async () => {
    const { publicKey } = await exportKeyPair(await generateIdentityKeyPair());
    expect(registryKeyMatchesFingerprint(publicKeyToBase64(publicKey), publicKey)).toBe(true);
  });

  it("rejects a substituted key listed under someone else's fingerprint", async () => {
    const victim = (await exportKeyPair(await generateIdentityKeyPair())).publicKey;
    const attacker = (await exportKeyPair(await generateIdentityKeyPair())).publicKey;
    expect(registryKeyMatchesFingerprint(publicKeyToBase64(victim), attacker)).toBe(false);
    expect(registryKeyMatchesFingerprint(publicKeyToBase64(victim), null)).toBe(false);
    expect(registryKeyMatchesFingerprint(publicKeyToBase64(victim), { ...victim, crv: "P-384" })).toBe(false);
  });
});

describe("numeric PINs", () => {
  it("allows 4 to 12 digits and nothing else", () => {
    expect(MIN_PIN_LENGTH).toBe(4);
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("123456789012")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("1234567890123")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("correct horse")).toBe(false);
  });

  it("refuses to save a PIN or Sentry PIN containing letters", async () => {
    await expect(setPin("abcd1234")).rejects.toThrow(/digits/);
    await expect(setPanicPin("wipe-it")).rejects.toThrow(/digits/);
  });
});

describe("weather disguise", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens only after the temperature is held for 2 seconds", () => {
    const onReveal = vi.fn();
    render(<WeatherDecoy onReveal={onReveal} />);
    const temperature = screen.getByTestId("weather-temperature");

    fireEvent.pointerDown(temperature);
    act(() => vi.advanceTimersByTime(1999));
    expect(onReveal).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("a shorter press or a tap does nothing", () => {
    const onReveal = vi.fn();
    render(<WeatherDecoy onReveal={onReveal} />);
    const temperature = screen.getByTestId("weather-temperature");

    fireEvent.pointerDown(temperature);
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.pointerUp(temperature);
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(temperature);
    act(() => vi.advanceTimersByTime(5000));
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("looks like an ordinary forecast and makes no network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<WeatherDecoy onReveal={() => {}} />);
    expect(screen.getByText("My Location")).toBeTruthy();
    expect(screen.getByText("7-day forecast")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const lock = vi.hoisted(() => ({
  appPin: "1234",
  panicPin: null as string | null,
  saved: [] as Array<{ kind: string; value: string }>,
}));

vi.mock("@/store/lock", () => ({
  MIN_PIN_LENGTH: 4,
  MAX_PIN_LENGTH: 12,
  isLockEnabled: () => true,
  hasPanicPin: () => lock.panicPin !== null,
  verifyPin: async (value: string) => value === lock.appPin,
  verifyPanicPin: async (value: string) => value === lock.panicPin,
  setPin: async (value: string) => void lock.saved.push({ kind: "app", value }),
  setPanicPin: async (value: string) => void lock.saved.push({ kind: "panic", value }),
}));
vi.mock("@/store/vault", () => ({ initVault: async () => {} }));
vi.mock("@/store/identity", () => ({ getIdentity: () => null }));
vi.mock("@/store/appPersist", () => ({ mirrorPhantomStorageToIDB: async () => {} }));

import PinSetup from "@/components/PinSetup";

const press = (digits: string) => {
  for (const digit of digits) fireEvent.click(screen.getByRole("button", { name: digit }));
};

describe("PIN setup", () => {
  beforeEach(() => {
    lock.saved.length = 0;
    lock.panicPin = null;
  });

  it("goes straight to a numeric keypad with no passphrase option", () => {
    render(<PinSetup onComplete={() => {}} />);
    expect(screen.queryByText(/passphrase/i)).toBeNull();
    expect(screen.getByText("Create PIN")).toBeTruthy();
    expect(screen.getByText(/4–12 digit PIN/)).toBeTruthy();
  });

  it("accepts a 4-digit PIN", async () => {
    const onComplete = vi.fn();
    render(<PinSetup onComplete={onComplete} />);
    press("975");
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    press("3");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Confirm PIN");
    press("9753");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(lock.saved).toEqual([{ kind: "app", value: "9753" }]);
  });

  it("refuses a Sentry PIN that matches the app PIN, which would wipe on every unlock", async () => {
    render(<PinSetup mode="panic" onComplete={() => {}} />);
    press(lock.appPin);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/must be different from your app PIN/)).toBeTruthy();
    expect(lock.saved).toEqual([]);
  });

  it("refuses an app PIN that matches the Sentry PIN", async () => {
    lock.panicPin = "5555";
    render(<PinSetup onComplete={() => {}} />);
    press("5555");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/must be different from your Sentry PIN/)).toBeTruthy();
  });
});

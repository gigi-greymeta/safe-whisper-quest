import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CryptoProvider } from "@/contexts/CryptoContext";
import { useCrypto } from "@/hooks/useCrypto";
// Note: CryptoProvider must wrap any component that calls useCrypto.
// AppContent is rendered as a child of <CryptoProvider> below.
import LockScreen from "@/components/LockScreen";
import RequireUnlocked from "@/components/RequireUnlocked";
import { isLockEnabled, disableLock, hasPanicPin, verifyPanicPin, verifyPin, recordUnlock, isLockedOut } from "@/store/lock";
import { markSessionUnlocked } from "@/store/sessionLock";
import CalculatorDecoy from "@/components/CalculatorDecoy";
import { titleMatchesAppPin } from "@/lib/notesPinTitle";
import { getDisguise, type DisguiseId } from "@/lib/disguise";
import { clearVault, hasVault, hydrateVaultToLocalStorage, lockVault, syncVaultFromLocalStorage, unlockVault } from "@/store/vault";
import { secureEraseAll, openPanicWipeIdentity, type PanicWipeIdentity } from "@/store/lock";
import { getIdentity } from "@/store/identity";
import { deleteIdentityFromServer } from "@/services/relay";
import { wipeDeviceCaches } from "@/lib/deviceWipe";
import { clearPinnedKeys } from "@/store/keyPinning";
import { clearPhantomStorageFromIDB, restorePhantomStorageFromIDB } from "@/store/appPersist";
import { clearSessionUnlock } from "@/store/sessionLock";
import Index from "./pages/Index.tsx";
import Contacts from "./pages/Contacts.tsx";
import Chat from "./pages/Chat.tsx";
import Settings from "./pages/Settings.tsx";
import SafetyNumber from "./pages/SafetyNumber.tsx";
import GroupChat from "./pages/GroupChat.tsx";
import NotFound from "./pages/NotFound.tsx";
import ResetWizard from "./pages/ResetWizard.tsx";
import DeleteAccount from "./pages/DeleteAccount.tsx";
import Notepad from "./pages/Notepad.tsx";
import VanishingGroups from "./pages/VanishingGroups.tsx";
import VanishingGroupChat from "./pages/VanishingGroupChat.tsx";
import { VanishingGroupsProvider, wipeAdministeredGroups } from "@/contexts/VanishingGroupsContext";
import NotesBoard from "@/components/notes/NotesBoard";
import { loadDecoyNotes, saveDecoyNotes, type Note } from "@/store/notes";
import BackupReminder from "@/components/BackupReminder";
import Paywall from "@/components/Paywall";
import GetTheApp from "@/components/GetTheApp";
import { detectMobileBrowser } from "@/lib/mobileBrowser";
import { watchTier } from "@/hooks/useTier";
import { CallProvider } from "@/contexts/CallContext";
import CallScreen from "@/components/CallScreen";

const queryClient = new QueryClient();

// Phone and tablet browsers get a "download the app" page, like Signal. Anyone who already
// has an identity or vault in this browser still gets in, so they can reach their data.
/** How long the panic wipe waits for the server to delete the account before wiping locally anyway. */
const SERVER_WIPE_TIMEOUT_MS = 4000;

const mobileBrowser = Capacitor.isNativePlatform() ? null : detectMobileBrowser(navigator.userAgent, navigator.maxTouchPoints);

const AppContent = () => {
  const { state, reloadState } = useCrypto();
  const [locked, setLocked] = useState(false);
  const [wiping, setWiping] = useState(false);

  const handleManualLock = async () => {
    clearSessionUnlock();
    try {
      await syncVaultFromLocalStorage();
    } catch {}
    try {
      lockVault();
    } catch {}
    setLocked(true);
  };

  useEffect(() => watchTier(), []);

  // Read from the OS: survives a panic wipe, so a wiped app still opens as the disguise.
  const [disguise, setDisguiseState] = useState<DisguiseId>("default");
  // Notes disguise: the decoy notes list stands in front of the app until a note titled with the PIN is added.
  const [decoyNotes, setDecoyNotes] = useState<Note[]>([]);
  useEffect(() => {
    void getDisguise().then(setDisguiseState);
    const onChange = (e: Event) => setDisguiseState((e as CustomEvent<DisguiseId>).detail);
    window.addEventListener("phantom:disguise", onChange);
    return () => window.removeEventListener("phantom:disguise", onChange);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await restorePhantomStorageFromIDB();
      // CRITICAL: Force the lock gate whenever EITHER:
      //   (a) lock is explicitly enabled, OR
      //   (b) an encrypted vault exists on disk (even if the flag was lost).
      // This prevents a fresh-browser / restored-IDB session from bypassing the
      // passcode and auto-opening chats when state is partially restored.
      if (mounted && (isLockEnabled() || hasVault())) {
        // Make absolutely sure no plaintext vault data is left readable until
        // the user proves possession of the passcode.
        try { lockVault(); } catch {}
        setLocked(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && isLockEnabled()) {
        void handleManualLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    const handleAppLock = () => {
      void handleManualLock();
    };

    window.addEventListener("phantom:lock", handleAppLock);
    return () => window.removeEventListener("phantom:lock", handleAppLock);
  }, []);

  const handlePanicWipe = (credential?: string) => {
    // Sentry mode: silently wipe everything and reload to a fresh-install state.
    // Render a blank screen immediately so no error/flash is visible during destruction.
    setWiping(true);
    // Defer to next frame so the blank screen paints before the (heavy) wipe runs.
    requestAnimationFrame(async () => {
      // Delete the account on the server first, while we can still prove we own it:
      // from the sealed copy if the vault is locked, or the open identity otherwise.
      // Capped so a slow or missing connection doesn't hold up the local wipe.
      try {
        let owner: PanicWipeIdentity | null = credential ? await openPanicWipeIdentity(credential) : null;
        const open = getIdentity();
        if (!owner && open) owner = { fingerprint: open.publicKeyFingerprint, privateKey: open.keyPair.privateKey };
        await Promise.race([
          Promise.allSettled([
            owner ? deleteIdentityFromServer(owner.fingerprint, owner.privateKey) : Promise.resolve(),
            // Vanishing groups this device runs are wiped from the server too.
            wipeAdministeredGroups(),
          ]),
          new Promise((resolve) => setTimeout(resolve, SERVER_WIPE_TIMEOUT_MS)),
        ]);
      } catch {
        // Offline or the server refused: the local wipe still goes ahead.
      }
      clearSessionUnlock();
      try { secureEraseAll(); } catch {}
      try { clearVault(); } catch {}
      try { clearPinnedKeys(); } catch {}
      try { disableLock(); } catch {}
      try { await clearPhantomStorageFromIDB(); } catch {}
      try { navigator.clipboard.writeText(""); } catch {}
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
      // Then every cache: browser databases, web cache, cookies, and the native WebView/app caches.
      try { await wipeDeviceCaches(); } catch {}
      // Hard reload — looks identical to first-time app launch (or the disguise's decoy screen).
      window.location.replace(window.location.origin + "/");
    });
  };

  // The panic credential also works at other credential prompts (e.g. unscrambling a message).
  useEffect(() => {
    const onPanic = (e: Event) => handlePanicWipe((e as CustomEvent<string | undefined>).detail);
    window.addEventListener("phantom:panic", onPanic);
    return () => window.removeEventListener("phantom:panic", onPanic);
  });

  if (wiping) {
    // Solid background, zero text — looks like a normal app boot.
    return <div className="dark fixed inset-0 z-[200] bg-background" />;
  }

  if (!state.initialized) {
    return <div className="dark fixed inset-0 bg-background" />;
  }

  if (locked) {
    const unlock = async (credential: string) => {
      if (hasVault()) {
        const ok = await unlockVault(credential);
        if (!ok) return false;
        await hydrateVaultToLocalStorage();
      }
      await reloadState();
      setLocked(false);
      return true;
    };

    if (disguise === "calculator") {
      return (
        <CalculatorDecoy
          onCode={async (code) => {
            if (isLockedOut().locked) return false;
            if (hasPanicPin() && (await verifyPanicPin(code))) {
              handlePanicWipe(code);
              return true;
            }
            if (!(await verifyPin(code)) || !(await unlock(code))) return false;
            recordUnlock();
            markSessionUnlocked();
            return true;
          }}
        />
      );
    }

    if (disguise === "notes") {
      return (
        <NotesBoard
          notes={decoyNotes.length ? decoyNotes : loadDecoyNotes()}
          onChange={(next) => {
            setDecoyNotes(next);
            saveDecoyNotes(next);
          }}
          title="Notes"
          onNewNoteTitle={async (title) => {
            // A new note titled with the app PIN unlocks the app; the panic PIN wipes it.
            if (title.length < 4 || title.length > 64) return false;
            if (hasPanicPin() && (await verifyPanicPin(title))) {
              handlePanicWipe(title);
              return true;
            }
            if (!(await titleMatchesAppPin(title)) || !(await unlock(title))) return false;
            recordUnlock();
            markSessionUnlocked();
            return true;
          }}
        />
      );
    }

    return <LockScreen onUnlock={unlock} onPanicWipe={handlePanicWipe} plain={disguise !== "default"} />;
  }

  if (mobileBrowser && !state.identity && !hasVault()) {
    return <GetTheApp os={mobileBrowser} />;
  }

  return (
    <>
      <BackupReminder />
      <CallScreen />
      <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/contacts" element={<RequireUnlocked><Contacts /></RequireUnlocked>} />
      <Route path="/chat/:contactId" element={<RequireUnlocked><Chat /></RequireUnlocked>} />
      <Route path="/chat/:contactId/safety" element={<RequireUnlocked><SafetyNumber /></RequireUnlocked>} />
      <Route path="/group/:groupId" element={<RequireUnlocked><GroupChat /></RequireUnlocked>} />
      <Route path="/settings" element={<RequireUnlocked><Settings /></RequireUnlocked>} />
      <Route path="/settings/delete-account" element={<RequireUnlocked><DeleteAccount /></RequireUnlocked>} />
      <Route path="/upgrade" element={<RequireUnlocked><Paywall /></RequireUnlocked>} />
      <Route path="/notes" element={<RequireUnlocked><Notepad /></RequireUnlocked>} />
      <Route path="/vanishing" element={<RequireUnlocked><VanishingGroups /></RequireUnlocked>} />
      <Route path="/vanishing/:groupId" element={<RequireUnlocked><VanishingGroupChat /></RequireUnlocked>} />
      <Route path="/reset" element={<ResetWizard />} />
      <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <CryptoProvider>
          <CallProvider>
            <VanishingGroupsProvider>
              <AppContent />
            </VanishingGroupsProvider>
          </CallProvider>
        </CryptoProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

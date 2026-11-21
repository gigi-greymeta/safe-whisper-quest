import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CryptoProvider } from "@/contexts/CryptoContext";
import { useCrypto } from "@/hooks/useCrypto";
// Note: CryptoProvider must wrap any component that calls useCrypto.
// AppContent is rendered as a child of <CryptoProvider> below.
import LockScreen from "@/components/LockScreen";
import RequireUnlocked from "@/components/RequireUnlocked";
import { isLockEnabled, disableLock } from "@/store/lock";
import { clearVault, hasVault, hydrateVaultToLocalStorage, lockVault, syncVaultFromLocalStorage, unlockVault } from "@/store/vault";
import { secureEraseAll } from "@/store/lock";
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
import BackupReminder from "@/components/BackupReminder";

const queryClient = new QueryClient();

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

  const handlePanicWipe = () => {
    // Sentry mode: silently wipe everything and reload to a fresh-install state.
    // Render a blank screen immediately so no error/flash is visible during destruction.
    setWiping(true);
    // Defer to next frame so the blank screen paints before the (heavy) wipe runs.
    requestAnimationFrame(async () => {
      clearSessionUnlock();
      try { secureEraseAll(); } catch {}
      try { clearVault(); } catch {}
      try { clearPinnedKeys(); } catch {}
      try { disableLock(); } catch {}
      try { await clearPhantomStorageFromIDB(); } catch {}
      try { navigator.clipboard.writeText(""); } catch {}
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
      // Hard reload — looks identical to first-time app launch.
      window.location.replace(window.location.origin + "/");
    });
  };

  if (wiping) {
    // Solid background, zero text — looks like a normal app boot.
    return <div className="dark fixed inset-0 z-[200] bg-background" />;
  }

  if (!state.initialized) {
    return <div className="dark fixed inset-0 bg-background" />;
  }

  if (locked) {
    return (
      <LockScreen
        onUnlock={async (credential) => {
          if (hasVault()) {
            const ok = await unlockVault(credential);
            if (!ok) return false;
            await hydrateVaultToLocalStorage();
          }
          await reloadState();
          setLocked(false);
          return true;
        }}
        onPanicWipe={handlePanicWipe}
      />
    );
  }


  return (
    <>
      <BackupReminder />
      <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/contacts" element={<RequireUnlocked><Contacts /></RequireUnlocked>} />
      <Route path="/chat/:contactId" element={<RequireUnlocked><Chat /></RequireUnlocked>} />
      <Route path="/chat/:contactId/safety" element={<RequireUnlocked><SafetyNumber /></RequireUnlocked>} />
      <Route path="/group/:groupId" element={<RequireUnlocked><GroupChat /></RequireUnlocked>} />
      <Route path="/settings" element={<RequireUnlocked><Settings /></RequireUnlocked>} />
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
          <AppContent />
        </CryptoProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

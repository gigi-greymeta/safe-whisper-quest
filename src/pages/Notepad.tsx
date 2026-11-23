import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotesBoard from "@/components/notes/NotesBoard";
import NotepadUnlockDialog from "@/components/notes/NotepadUnlockDialog";
import NotepadSettingsDialog from "@/components/notes/NotepadSettingsDialog";
import ScrambleReveal from "@/components/notes/ScrambleReveal";
import { checkNoteTitle } from "@/lib/notesPinTitle";
import { hasNotepadPin, isLockEnabled } from "@/store/lock";
import { useTier } from "@/hooks/useTier";
import { useToast } from "@/hooks/use-toast";
import { syncVaultFromLocalStorage } from "@/store/vault";
import {
  getNotepadSettings,
  hasSecureNotes,
  loadDecoyNotes,
  loadSecureNotes,
  saveDecoyNotes,
  saveNotepadSettings,
  saveSecureNotes,
  shuffleDecoyNotes,
  type Note,
  type NotepadSettings,
} from "@/store/notes";

type Mode = "decoy" | "locked" | "revealing" | "open";

/**
 * Locked notepad (Standard; the decoy list is Premium). Real notes open only with
 * biometrics or a PIN. With the decoy list on (the default for Premium), Notes opens
 * with no prompt to a random set of ordinary notes; adding a new note titled with the
 * PIN scrambles them into the real
 * ones (the PIN note itself is never saved). Leaving the app locks the notes again. After a
 * downgrade, existing notes can still be opened, edited and deleted, but new ones
 * need a paid plan, and the decoy list switches off.
 */
const Notepad = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { has } = useTier();
  const allowed = has("notepad") || hasSecureNotes();
  const decoyAllowed = has("notepadDecoy");
  const [settings, setSettings] = useState<NotepadSettings>(getNotepadSettings);
  // Premium opens straight to the decoy list with no PIN; the PIN goes in as a note title.
  // That needs a PIN to exist, so without one, fall back to the prompt (which explains how to set one).
  const initialMode = useCallback(
    (s: NotepadSettings): Mode =>
      s.decoy && decoyAllowed && (isLockEnabled() || (s.pinSource === "notepad" && hasNotepadPin())) ? "decoy" : "locked",
    [decoyAllowed]
  );
  const [mode, setMode] = useState<Mode>(() => initialMode(getNotepadSettings()));
  const [unlockOpen, setUnlockOpen] = useState(() => initialMode(getNotepadSettings()) === "locked");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [decoys, setDecoys] = useState<Note[]>(loadDecoyNotes);
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    if (!allowed) navigate("/upgrade", { replace: true });
  }, [allowed, navigate]);

  const lock = useCallback(() => {
    setNotes([]);
    setSettingsOpen(false);
    const next = initialMode(getNotepadSettings());
    setMode(next);
    setUnlockOpen(next === "locked");
  }, [initialMode]);

  // Leaving the app locks the notes.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && lock();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [lock]);

  const open = async (reveal = false) => {
    setUnlockOpen(false);
    try {
      setNotes(await loadSecureNotes());
      setMode(reveal ? "revealing" : "open");
    } catch (e) {
      console.error("[notes] decrypt failed", e);
      toast({ title: "Couldn't open notes", variant: "destructive" });
      lock();
    }
  };

  const updateNotes = (next: Note[]) => {
    setNotes(next);
    void saveSecureNotes(next)
      .then(() => syncVaultFromLocalStorage(["phantom_secure_notes"]))
      .catch((e) => console.error("[notes] save failed", e));
  };

  const updateSettings = (next: NotepadSettings) => {
    setSettings(next);
    saveNotepadSettings(next);
  };

  const onNewNoteTitle = async (title: string) => {
    const result = await checkNoteTitle(title, settings);
    if (result === "panic") window.dispatchEvent(new CustomEvent("phantom:panic", { detail: title }));
    else if (result === "unlock") await open(true);
    return result !== "none";
  };

  if (!allowed) return null;

  if (mode === "revealing") {
    return <ScrambleReveal from={decoys} to={notes} onDone={() => setMode("open")} />;
  }

  if (mode === "open") {
    return (
      <>
        <NotesBoard
          notes={notes}
          onChange={updateNotes}
          title="Private notes"
          onBack={() => navigate(-1)}
          canCreate={has("notepad")}
          onCreateBlocked={() => navigate("/upgrade")}
          emptyText="No private notes yet. They're encrypted on this device and lock when you leave."
          actions={
            <>
              <Button variant="ghost" size="icon" aria-label="Notes settings" onClick={() => setSettingsOpen(true)}>
                <SettingsIcon className="h-5 w-5 text-primary" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Lock notes" onClick={lock}>
                <Lock className="h-5 w-5 text-primary" />
              </Button>
            </>
          }
        />
        <NotepadSettingsDialog
          open={settingsOpen}
          settings={settings}
          decoyAllowed={decoyAllowed}
          onDecoyBlocked={() => navigate("/upgrade")}
          onShuffleDecoys={() => setDecoys(shuffleDecoyNotes())}
          onClose={() => setSettingsOpen(false)}
          onChange={updateSettings}
        />
      </>
    );
  }

  return (
    <>
      {mode === "decoy" ? (
        <NotesBoard
          notes={decoys}
          onChange={(next) => {
            setDecoys(next);
            saveDecoyNotes(next);
          }}
          title="Notes"
          onBack={() => navigate(-1)}
          onNewNoteTitle={onNewNoteTitle}
        />
      ) : (
        <div className="dark h-screen bg-background" />
      )}
      <NotepadUnlockDialog
        open={unlockOpen}
        settings={settings}
        onClose={() => {
          setUnlockOpen(false);
          if (mode === "locked") navigate(-1);
        }}
        onUnlock={() => void open(false)}
      />
    </>
  );
};

export default Notepad;

import { useEffect, useState } from "react";
import { Shield, Download, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const LAST_BACKUP_KEY = "phantom_last_backup_at";
const SNOOZE_UNTIL_KEY = "phantom_backup_snooze_until";
const FIRST_SEEN_KEY = "phantom_first_seen_at";

// iOS Safari/Chrome can wipe localStorage after ~7 days of inactivity (ITP).
// Remind every 5 days to stay safely inside that window.
const REMIND_AFTER_MS = 5 * 24 * 60 * 60 * 1000;
const SNOOZE_MS = 24 * 60 * 60 * 1000;

const exportVaultNow = () => {
  const exportData: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("phantom_")) {
      exportData[key] = localStorage.getItem(key);
    }
  }
  const blob = new Blob(
    [JSON.stringify({ version: 1, exportedAt: Date.now(), data: exportData })],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `phantom-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
};

const BackupReminder = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const hasIdentity = !!localStorage.getItem("phantom_identity");
    if (!hasIdentity) return;

    if (!localStorage.getItem(FIRST_SEEN_KEY)) {
      localStorage.setItem(FIRST_SEEN_KEY, String(Date.now()));
    }

    const now = Date.now();
    const snoozeUntil = Number(localStorage.getItem(SNOOZE_UNTIL_KEY) || 0);
    if (snoozeUntil && now < snoozeUntil) return;

    const lastBackup = Number(
      localStorage.getItem(LAST_BACKUP_KEY) ||
        localStorage.getItem(FIRST_SEEN_KEY) ||
        now
    );
    if (now - lastBackup >= REMIND_AFTER_MS) {
      const t = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const handleExport = () => {
    try {
      exportVaultNow();
    } catch {
      // ignore — user can retry from Settings
    }
    setOpen(false);
  };

  const handleSnooze = () => {
    localStorage.setItem(SNOOZE_UNTIL_KEY, String(Date.now() + SNOOZE_MS));
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Shield className="h-5 w-5" />
            <DialogTitle>Back up your vault</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-left">
            iOS may wipe browser storage after ~7 days of inactivity. Phantom is
            zero-knowledge — if your device storage is cleared and you have no
            backup, your identity and messages are gone forever.
            <br />
            <br />
            Export an encrypted backup now and store it somewhere safe (iCloud
            Drive, email to yourself, password manager).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleExport} className="w-full">
            <Download className="h-4 w-4 mr-2" /> Export vault now
          </Button>
          <Button variant="ghost" onClick={handleSnooze} className="w-full">
            <Clock className="h-4 w-4 mr-2" /> Remind me tomorrow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BackupReminder;
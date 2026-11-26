import { useState } from "react";
import { Download, Upload, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const EXPORT_KEYS = [
  "phantom_identity",
  "phantom_contacts",
  "phantom_messages",
  "phantom_groups",
  "phantom_group_messages",
  "phantom_pinned_keys",
  "phantom_disappear_timer",
  "phantom_ratchet_stats",
];

const VaultExport = () => {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    const exportData: Record<string, string | null> = {};
    
    // Collect all phantom_ prefixed data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("phantom_")) {
        exportData[key] = localStorage.getItem(key);
      }
    }

    // Also collect vault-prefixed data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("phantom_vault_")) {
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

    // Record backup time so the auto-reminder knows you're up to date.
    try {
      localStorage.setItem("phantom_last_backup_at", String(Date.now()));
      localStorage.removeItem("phantom_backup_snooze_until");
    } catch {}

    toast({
      title: "Backup exported",
      description: "Encrypted vault backup saved. Store it securely.",
    });
  };

  // Security-critical keys that must NEVER be overwritten by an imported backup.
  // Allowing this would let a malicious backup replace the PIN hash, panic credential,
  // or vault verification token — enabling full authentication bypass.
  const FORBIDDEN_IMPORT_KEYS = new Set([
    "phantom_pin_hash",
    "phantom_pin_salt",
    "phantom_pin_kdf_version",
    "phantom_panic_hash",
    "phantom_panic_salt",
    "phantom_vault_check",
    "phantom_vault_salt",
    "phantom_vault_kdf_version",
    "phantom_pin_attempts",
    "phantom_pin_lockout_until",
  ]);

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        const text = await file.text();
        if (text.length > 50 * 1024 * 1024) {
          throw new Error("Backup file too large");
        }
        const parsed = JSON.parse(text);
        if (!parsed?.version || !parsed?.data || typeof parsed.data !== "object") {
          throw new Error("Invalid backup format");
        }

        let restored = 0;
        let skipped = 0;
        for (const [key, value] of Object.entries(parsed.data)) {
          // Allow-list: only phantom_-prefixed string keys
          if (typeof key !== "string" || !key.startsWith("phantom_")) {
            skipped++;
            continue;
          }
          if (typeof value !== "string") {
            skipped++;
            continue;
          }
          // Block security-critical auth/lock keys — these can only be set
          // through the PIN setup flow, never restored from a backup.
          if (FORBIDDEN_IMPORT_KEYS.has(key)) {
            skipped++;
            continue;
          }
          // Sanity cap on individual value size (10MB)
          if (value.length > 10 * 1024 * 1024) {
            skipped++;
            continue;
          }
          localStorage.setItem(key, value);
          restored++;
        }

        toast({
          title: "Backup restored",
          description: `${restored} item(s) restored${skipped ? `, ${skipped} skipped for safety` : ""}. Reloading…`,
        });
        setTimeout(() => window.location.reload(), 1500);
      } catch {
        toast({
          title: "Import failed",
          description: "Could not parse backup file.",
          variant: "destructive",
        });
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Export your encrypted vault for offline backup.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleExport} className="flex-1">
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export
        </Button>
        <Button variant="outline" size="sm" onClick={handleImport} disabled={importing} className="flex-1">
          <Upload className="h-3.5 w-3.5 mr-1.5" /> {importing ? "Importing..." : "Import"}
        </Button>
      </div>
    </div>
  );
};

export default VaultExport;

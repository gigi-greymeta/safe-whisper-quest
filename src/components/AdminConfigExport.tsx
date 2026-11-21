import { useState } from "react";
import { Download, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

/**
 * Derives an AES-256-GCM key from a passphrase using PBKDF2 (200k iterations).
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const enc2 = new TextEncoder();
  const rawKey = enc2.encode(passphrase);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    rawKey.buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 200000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
}

/**
 * Encrypts plaintext with AES-256-GCM using a passphrase-derived key.
 */
async function encryptPayload(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  // Pack: version(1) + salt(16) + iv(12) + ciphertext
  const packed = new Uint8Array(1 + 16 + 12 + ciphertext.byteLength);
  packed[0] = 0x01; // version byte
  packed.set(salt, 1);
  packed.set(iv, 17);
  packed.set(new Uint8Array(ciphertext), 29);
  // Base64 encode
  return btoa(String.fromCharCode(...packed));
}

const ADMIN_CONFIG_KEYS = [
  // Identity & crypto keys
  "phantom_identity",
  "phantom_pinned_keys",
  "phantom_ratchet_stats",
  // Lock & auth config
  "phantom_lock_pin_hash",
  "phantom_lock_enabled",
  "phantom_panic_pin_hash",
  // Relay & session config
  "phantom_relay_queue",
  "phantom_disappear_timer",
  // Vault encryption keys
  "phantom_vault_key",
  "phantom_vault_iv",
];

const AdminConfigExport = () => {
  const { toast } = useToast();
  const [passphrase, setPassphrase] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (passphrase.length < 8) {
      toast({
        title: "Weak passphrase",
        description: "Use at least 8 characters for encryption.",
        variant: "destructive",
      });
      return;
    }

    setExporting(true);
    try {
      const configData: Record<string, string | null> = {};

      // Collect all admin/auth/crypto keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (
          ADMIN_CONFIG_KEYS.includes(key) ||
          key.startsWith("phantom_vault_") ||
          key.startsWith("phantom_lock_") ||
          key.startsWith("phantom_ratchet_")
        ) {
          configData[key] = localStorage.getItem(key);
        }
      }

      const payload = JSON.stringify({
        version: 1,
        type: "phantom_admin_config",
        exportedAt: new Date().toISOString(),
        keyCount: Object.keys(configData).length,
        data: configData,
      });

      const encrypted = await encryptPayload(payload, passphrase);

      const blob = new Blob(
        [
          JSON.stringify({
            format: "phantom-encrypted-admin-config",
            version: 1,
            encryption: "AES-256-GCM",
            kdf: "PBKDF2-SHA256-200k",
            payload: encrypted,
          }),
        ],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `phantom-admin-config-${new Date().toISOString().slice(0, 10)}.enc.json`;
      a.click();
      URL.revokeObjectURL(url);

      setPassphrase("");
      toast({
        title: "Admin config exported",
        description: "AES-256-GCM encrypted file ready for external drive.",
      });
    } catch {
      toast({
        title: "Export failed",
        description: "Could not encrypt admin configuration.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Export your account — identity keys, PIN, and pinned contacts — as an AES-256-GCM encrypted file.
        Safe to store on an external drive so you can restore on a new device.
      </p>
      <div className="relative">
        <Input
          type={showPass ? "text" : "password"}
          placeholder="Encryption passphrase (min 8 chars)"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className="pr-10 text-sm"
        />
        <button
          type="button"
          onClick={() => setShowPass(!showPass)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={exporting || passphrase.length < 8}
        className="w-full"
      >
        <Lock className="h-3.5 w-3.5 mr-1.5" />
        {exporting ? "Encrypting..." : "Encrypt & Download"}
        <Download className="h-3.5 w-3.5 ml-1.5" />
      </Button>
      <p className="text-[10px] text-muted-foreground">
        PBKDF2 200k iterations • AES-256-GCM • Random salt + IV per export
      </p>
    </div>
  );
};

export default AdminConfigExport;

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, ListChecks, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getIdentity, restoreIdentityIfMissing } from "@/store/identity";
import { restoreContactsIfMissing } from "@/store/contacts";
import { hasVault, isVaultUnlocked, vaultGet } from "@/store/vault";

interface CheckItem {
  key: string;
  label: string;
  hint: string;
  ok: boolean;
}

async function evaluate(): Promise<CheckItem[]> {
  const vaultConfigured = hasVault();
  const vaultUnlocked = isVaultUnlocked();

  // Best-effort rehydrate before reading
  await restoreIdentityIfMissing().catch(() => null);
  const identity = getIdentity();
  const identityVaulted = await vaultGet("phantom_identity").then(v => !!v).catch(() => false);

  const contacts = await restoreContactsIfMissing();
  const contactsVaulted = await vaultGet("phantom_contacts").then(v => !!v).catch(() => false);

  return [
    {
      key: "vault-configured",
      label: "Encrypted vault configured",
      hint: "Set a PIN in Screen Lock to enable the encrypted vault.",
      ok: vaultConfigured,
    },
    {
      key: "vault-unlocked",
      label: "Vault unlocked this session",
      hint: "Enter your PIN at the lock screen to unlock the vault.",
      ok: vaultUnlocked,
    },
    {
      key: "identity-hydrated",
      label: "Identity hydrated into memory",
      hint: "Reopen the app and unlock — identity is restored from vault/IndexedDB.",
      ok: !!identity,
    },
    {
      key: "identity-persisted",
      label: "Identity safely stored in vault",
      hint: "Identity should be encrypted in the vault. If missing, sign out and back in.",
      ok: identityVaulted,
    },
    {
      key: "contacts-present",
      label: "At least one contact added",
      hint: "Add a contact from the Contacts screen so you have someone to message.",
      ok: contacts.length > 0,
    },
    {
      key: "contacts-persisted",
      label: "Contacts mirrored to vault",
      hint: "Add or re-save a contact while the vault is unlocked to mirror them.",
      ok: contactsVaulted,
    },
  ];
}

export default function MessagingReadinessChecklist() {
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setItems(await evaluate());
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!items) {
    return <p className="text-xs text-muted-foreground">Evaluating prerequisites…</p>;
  }

  const passed = items.filter(i => i.ok).length;
  const allOk = passed === items.length;

  return (
    <div className="space-y-3">
      <div
        className={`rounded-md border p-2.5 text-xs ${
          allOk
            ? "border-primary/40 bg-primary/10 text-foreground"
            : "border-destructive/40 bg-destructive/10 text-foreground"
        }`}
      >
        <div className="flex items-center gap-2">
          <ListChecks className="h-3.5 w-3.5" />
          <span className="font-semibold">
            {allOk ? "Ready to send messages" : `${passed} / ${items.length} prerequisites met`}
          </span>
        </div>
        {!allOk && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Resolve the unchecked items below — messages may fail with “missing identity or contact” until they pass.
          </p>
        )}
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2">
            {item.ok ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            ) : (
              <Circle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            )}
            <div className="flex-1">
              <p className={`text-xs ${item.ok ? "text-foreground" : "text-foreground font-medium"}`}>
                {item.label}
              </p>
              {!item.ok && (
                <p className="text-[10px] text-muted-foreground">{item.hint}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Re-check
        </Button>
      </div>
    </div>
  );
}
import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, AlertCircle, RefreshCw, Smartphone, Lock } from "lucide-react";
import { CollapsibleSection } from "@/components/CollapsibleCard";
import { Button } from "@/components/ui/button";
import { getIdentity, restoreIdentityIfMissing } from "@/store/identity";
import { restoreContactsIfMissing } from "@/store/contacts";
import { isVaultUnlocked, hasVault, vaultGet } from "@/store/vault";
import { readIdentityFromIDB } from "@/store/identityPersist";

interface HealthSnapshot {
  identityInMemory: boolean;
  identityInLocalStorage: boolean;
  identityInVault: boolean;
  identityInIDB: boolean;
  contactCount: number;
  contactsInVault: boolean;
  vaultUnlocked: boolean;
  vaultConfigured: boolean;
  idbAvailable: boolean;
  localStorageAvailable: boolean;
  checkedAt: number;
}

const LAST_CHECK_KEY = "phantom_storage_health_last_check";

async function probe(): Promise<HealthSnapshot> {
  const identity = getIdentity();
  const lsIdentity = (() => {
    try { return localStorage.getItem("phantom_identity") !== null; } catch { return false; }
  })();
  const vaultIdentity = await vaultGet("phantom_identity").then(v => !!v).catch(() => false);
  const idbIdentity = await readIdentityFromIDB().then(v => !!v).catch(() => false);
  const contacts = await restoreContactsIfMissing();
  const vaultContacts = await vaultGet("phantom_contacts").then(v => !!v).catch(() => false);

  let lsOk = false;
  try {
    localStorage.setItem("__phantom_probe", "1");
    localStorage.removeItem("__phantom_probe");
    lsOk = true;
  } catch {}

  let idbOk = false;
  try {
    idbOk = typeof indexedDB !== "undefined";
  } catch {}

  return {
    identityInMemory: !!identity,
    identityInLocalStorage: lsIdentity,
    identityInVault: vaultIdentity,
    identityInIDB: idbIdentity,
    contactCount: contacts.length,
    contactsInVault: vaultContacts,
    vaultUnlocked: isVaultUnlocked(),
    vaultConfigured: hasVault(),
    idbAvailable: idbOk,
    localStorageAvailable: lsOk,
    checkedAt: Date.now(),
  };
}

function Row({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2 py-1">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
      ) : (
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />
      )}
      <div className="flex-1">
        <p className="text-xs text-foreground">{label}</p>
        {detail && <p className="text-[10px] text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

export default function StorageHealth() {
  const [snap, setSnap] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    // Trigger a rehydration attempt so the readout reflects best-effort state
    await restoreIdentityIfMissing().catch(() => null);
    const s = await probe();
    setSnap(s);
    try { localStorage.setItem(LAST_CHECK_KEY, String(s.checkedAt)); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!snap) {
    return <p className="text-xs text-muted-foreground">Checking storage…</p>;
  }

  const identityBound =
    snap.identityInMemory || snap.identityInLocalStorage || snap.identityInVault || snap.identityInIDB;
  const contactsBound = snap.contactCount > 0 || snap.contactsInVault;

  const lastChecked = new Date(snap.checkedAt).toLocaleTimeString();

  return (
    <div className="space-y-3">
      <CollapsibleSection icon={<Smartphone className="h-3.5 w-3.5 text-primary" />} title="Device Binding">
        <Row
          ok={identityBound}
          label={identityBound ? "Identity is device-bound" : "Identity NOT found on this device"}
          detail={
            identityBound
              ? `Sources: ${[
                  snap.identityInMemory && "memory",
                  snap.identityInLocalStorage && "localStorage",
                  snap.identityInVault && "vault",
                  snap.identityInIDB && "IndexedDB",
                ].filter(Boolean).join(", ")}`
              : "Unlock the vault or restore from backup"
          }
        />
        <Row
          ok={contactsBound}
          label={`${snap.contactCount} contact${snap.contactCount === 1 ? "" : "s"} on this device`}
        />
      </CollapsibleSection>

      <CollapsibleSection icon={<Lock className="h-3.5 w-3.5 text-primary" />} title="Vault & Hydration">
        <Row
          ok={snap.vaultConfigured}
          label={snap.vaultConfigured ? "Encrypted vault configured" : "No vault — set a PIN to enable"}
        />
      </CollapsibleSection>

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Activity className="h-3 w-3" /> Last checked {lastChecked}
        </p>
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
    </div>
  );
}
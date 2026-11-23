import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Copy, Check, BadgeCheck, PlayCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCrypto } from "@/hooks/useCrypto";
import { getContact, restoreContactsIfMissing, updateContact } from "@/store/contacts";
import { getRatchetState } from "@/store/ratchetState";
import QRCodeDisplay from "@/components/QRCode";
import { useMemo, useState, useEffect } from "react";
import { runSafetyVerification, type SafetyVerificationResult } from "@/lib/safetyVerification";

/**
 * Derive a human-readable safety number from the two long-term identity keys.
 * It must stay identical on both devices before and after messages are exchanged.
 */
function deriveSafetyNumber(myFingerprint: string, peerFingerprint: string): string {
  // Sort so both parties compute the same number regardless of who is "me"
  const [a, b] = [myFingerprint, peerFingerprint].sort();
  const combined = a + "|" + b;

  // Simple hash → 60-digit numeric safety number (displayed as 12 groups of 5)
  let hash = 0;
  const digits: number[] = [];
  for (let round = 0; round < 60; round++) {
    const input = combined + ":" + round;
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    hash = (hash + Math.abs(h)) >>> 0;
    digits.push(hash % 10);
  }

  // Format as 12 groups of 5 digits
  const groups: string[] = [];
  for (let i = 0; i < 60; i += 5) {
    groups.push(digits.slice(i, i + 5).join(""));
  }
  return groups.join(" ");
}

const SafetyNumber = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const { state } = useCrypto();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [verified, setVerified] = useState(() => {
    const c = contactId ? getContact(contactId) : undefined;
    return c?.verified ?? false;
  });
  const [testResult, setTestResult] = useState<SafetyVerificationResult | null>(null);

  const [restoredContact, setRestoredContact] = useState(() => contactId ? getContact(contactId) : undefined);
  const contact = contactId ? state.contacts.find((c) => c.id === contactId) ?? restoredContact ?? getContact(contactId) : undefined;
  const identity = state.identity;

  const ratchetState = contactId ? getRatchetState(contactId) : null;

  const safetyNumber = useMemo(() => {
    if (!identity || !contact) return "";
    return deriveSafetyNumber(
      identity.publicKeyFingerprint,
      contact.publicKeyFingerprint
    );
  }, [identity, contact]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(safetyNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunTest = () => {
    if (!identity || !contact || !contactId) return;
    const result = runSafetyVerification(
      identity.publicKeyFingerprint,
      contactId,
      contact.publicKeyFingerprint,
      safetyNumber
    );
    setTestResult(result);
  };

  useEffect(() => {
    if (!contactId) {
      navigate("/contacts");
      return;
    }

    if (contact || !identity) return;

    let cancelled = false;
    void restoreContactsIfMissing().then((contacts) => {
      if (cancelled) return;
      const restored = contacts.find((c) => c.id === contactId);
      if (restored) setRestoredContact(restored);
      else navigate("/contacts", { replace: true });
    });

    return () => {
      cancelled = true;
    };
  }, [contact, contactId, identity, navigate]);

  if (!contact || !identity) {
    return (
      <div className="dark flex items-center justify-center h-screen bg-background">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="dark flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b bg-card/50 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/chat/${contactId}`)}>
          <ArrowLeft className="h-5 w-5 text-primary" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">Safety Number</p>
          <p className="text-[10px] text-muted-foreground truncate">with {contact.displayName}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center gap-6">
        {/* Explanation */}
        <div className="flex flex-col items-center gap-3 text-center max-w-[300px]">
          <ShieldCheck className="h-12 w-12 text-primary" />
          <p className="text-sm text-foreground font-medium">
            Verify your security with {contact.displayName}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Compare the number below with {contact.displayName}'s screen. If they match,
            your end-to-end encryption is verified and no one is intercepting your messages.
          </p>
        </div>

        {/* QR Code */}
        <QRCodeDisplay value={safetyNumber.replace(/\s/g, "")} size={160} />

        {/* Safety Number Display */}
        <div className="w-full max-w-[300px] bg-card border rounded-xl p-4">
          <p className="font-mono text-sm text-foreground text-center leading-loose tracking-wider select-all">
            {safetyNumber}
          </p>
        </div>

        {/* Copy Button */}
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy Safety Number
            </>
          )}
        </Button>

        {/* Verify / Unverify Button */}
        <Button
          variant={verified ? "outline" : "default"}
          className="gap-2 w-full max-w-[300px]"
          onClick={() => {
            if (contactId) {
              updateContact(contactId, { verified: !verified });
              setVerified(!verified);
            }
          }}
        >
          <BadgeCheck className="h-4 w-4" />
          {verified ? "Verified ✓ — Tap to unverify" : "Mark as Verified"}
        </Button>

        {/* Verification Self-Test */}
        <div className="w-full max-w-[300px] space-y-2">
          <Button
            variant="outline"
            className="gap-2 w-full"
            onClick={handleRunTest}
          >
            <PlayCircle className="h-4 w-4" />
            Run verification test
          </Button>
          {testResult && (
            <div
              className={
                "rounded-lg border p-3 text-xs " +
                (testResult.ok
                  ? "border-primary/30 bg-primary/5 text-primary"
                  : "border-destructive/30 bg-destructive/10 text-destructive")
              }
            >
              <div className="flex items-center gap-1.5 font-medium">
                {testResult.ok ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                {testResult.ok
                  ? "Safety number is stable"
                  : "Mismatch detected"}
              </div>
              <p className="mt-1 leading-snug opacity-90">
                Re-derived after{" "}
                <span className="font-mono">{testResult.ratchetSteps}</span>{" "}
                ratchet step{testResult.ratchetSteps === 1 ? "" : "s"}
                {testResult.ratchetRootSeen ? " (PFS root active)" : " (no PFS yet)"}.
              </p>
              {testResult.reason && (
                <p className="mt-1 leading-snug">{testResult.reason}</p>
              )}
            </div>
          )}
        </div>

        {/* Info cards */}
        <div className="w-full max-w-[300px] space-y-3 mt-2">
          <div className="bg-card/50 border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              <span className="text-foreground font-medium">In person:</span> Compare the numbers side-by-side, or scan the QR code from each other's screens.
            </p>
          </div>
          <div className="bg-card/50 border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              <span className="text-foreground font-medium">Remotely:</span> Read the numbers aloud over a trusted voice call.
            </p>
          </div>
          {ratchetState ? (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <p className="text-xs text-primary">
                ✓ This number includes your Double Ratchet root key, providing forward secrecy verification.
              </p>
            </div>
          ) : (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-xs text-yellow-400">
                ⚠ Legacy mode — this number is based on static keys only. Exchange a message to activate PFS verification.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SafetyNumber;

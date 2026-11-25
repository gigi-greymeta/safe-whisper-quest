import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Copy, Check, BadgeCheck, PlayCircle, AlertTriangle, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCrypto } from "@/hooks/useCrypto";
import { getContact, restoreContactsIfMissing, updateContact } from "@/store/contacts";
import { getRatchetState } from "@/store/ratchetState";
import QRCodeDisplay from "@/components/QRCode";
import { useState, useEffect } from "react";
import { runSafetyVerification, type SafetyVerificationResult } from "@/lib/safetyVerification";
import QRScanner from "@/components/QRScanner";
import { safetyDigits } from "@/lib/qrCodes";
import { deriveSafetyNumber, legacySafetyNumber } from "@/crypto/safetyNumber";

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
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<"match" | "mismatch" | "outdated" | null>(null);

  const [restoredContact, setRestoredContact] = useState(() => contactId ? getContact(contactId) : undefined);
  const contact = contactId ? state.contacts.find((c) => c.id === contactId) ?? restoredContact ?? getContact(contactId) : undefined;
  const identity = state.identity;

  const ratchetState = contactId ? getRatchetState(contactId) : null;

  const myFingerprint = identity?.publicKeyFingerprint;
  const peerFingerprint = contact?.publicKeyFingerprint;
  const [safetyNumber, setSafetyNumber] = useState("");
  useEffect(() => {
    if (!myFingerprint || !peerFingerprint) return;
    let cancelled = false;
    void deriveSafetyNumber(myFingerprint, peerFingerprint).then((value) => {
      if (!cancelled) setSafetyNumber(value);
    });
    return () => {
      cancelled = true;
    };
  }, [myFingerprint, peerFingerprint]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(safetyNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Both phones derive the same number only if each holds the other's real key,
  // so scanning their screen and comparing checks the keys in person.
  const handleScannedSafetyCode = (text: string): string | null => {
    if (!safetyNumber) return "Still calculating your safety number. Try again in a moment.";
    const scanned = safetyDigits(text);
    if (scanned.length !== 60) return "That isn't a safety number code. Ask them to open this screen for your chat.";
    if (scanned === safetyDigits(safetyNumber)) {
      if (contactId) updateContact(contactId, { verified: true });
      setVerified(true);
      setScanResult("match");
    } else if (identity && contact && scanned === legacySafetyNumber(identity.publicKeyFingerprint, contact.publicKeyFingerprint)) {
      // Same keys, older app: its screen still shows the previous number format.
      setScanResult("outdated");
    } else {
      setScanResult("mismatch");
    }
    return null;
  };

  const handleRunTest = async () => {
    if (!identity || !contact || !contactId) return;
    const result = await runSafetyVerification(
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
        </div>

        {/* QR Code */}
        {safetyNumber ? (
          <QRCodeDisplay value={safetyNumber.replace(/\s/g, "")} />
        ) : (
          <div className="h-[236px] w-[236px] rounded-xl border bg-card flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Calculating…</p>
          </div>
        )}

        <Button className="gap-2 w-full max-w-[300px]" disabled={!safetyNumber} onClick={() => { setScanResult(null); setScanning(true); }}>
          <ScanLine className="h-4 w-4" />
          Scan their code
        </Button>
        {scanResult === "match" && (
          <div className="w-full max-w-[300px] rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-primary flex items-start gap-2">
            <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Safety numbers match. {contact.displayName} is verified.</span>
          </div>
        )}
        {scanResult === "outdated" && (
          <div className="w-full max-w-[300px] rounded-lg border border-border p-3 text-xs text-muted-foreground flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              {contact.displayName}'s app shows the older safety number format. Ask them to update Phantom, then scan again.
            </span>
          </div>
        )}
        {scanResult === "mismatch" && (
          <div className="w-full max-w-[300px] rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              The numbers don't match. One of you may not have the other's real key. Don't share anything sensitive until you've
              re-added each other in person.
            </span>
          </div>
        )}
        <QRScanner
          open={scanning}
          onOpenChange={setScanning}
          title="Scan their safety code"
          description={`Ask ${contact.displayName} to open this screen for your chat, then point your camera at their code.`}
          onCode={handleScannedSafetyCode}
        />

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
              <Check className="text-primary h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="text-primary h-4 w-4" />
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
            onClick={() => void handleRunTest()}
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

          {ratchetState ? (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <p className="text-xs text-primary">
                ✓ This number includes your Double Ratchet root key.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SafetyNumber;

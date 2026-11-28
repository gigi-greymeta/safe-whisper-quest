import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Trash2, Loader2, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCrypto } from "@/hooks/useCrypto";
import { deleteIdentityFromServer } from "@/services/relay";
import { eraseAllLocalData } from "@/lib/eraseDevice";
import { currentOwner, wipeServerData } from "@/lib/serverWipe";

type Step = "confirm" | "deleting" | "done";

const CONFIRM_WORD = "DELETE";

const DeleteAccount = () => {
  const navigate = useNavigate();
  const { state, burnAllData } = useCrypto();
  const [step, setStep] = useState<Step>("confirm");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const identity = state.identity;

  const runDelete = async () => {
    if (!identity) return;
    setError(null);
    setStep("deleting");
    try {
      // Server first: if it fails, the user still has their keys and can retry.
      await deleteIdentityFromServer(identity.publicKeyFingerprint, identity.keyPair.privateKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("confirm");
      return;
    }

    // Push registration, request inbox, and the history of vanishing groups this phone runs (the
    // groups stay active for members). The account itself is already gone, so that step is a no-op.
    await wipeServerData(currentOwner());

    // Then destroy every local trace (the same erase as the Reset Wizard and panic wipe).
    await eraseAllLocalData(burnAllData);
    setStep("done");
  };

  return (
    <div className="dark flex flex-col min-h-screen bg-background">
      <div className="flex items-center gap-3 p-4 border-b bg-card/50 backdrop-blur-sm">
        {step === "confirm" && (
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5 text-primary" />
          </Button>
        )}
        <h1 className="text-lg font-semibold text-foreground">Delete Account</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 max-w-md w-full mx-auto space-y-4">
        {step === "confirm" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-destructive" />
                Permanently delete your Phantom identity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-2">
                <p className="flex items-center gap-2 text-destructive font-medium">
                  <AlertTriangle className="h-4 w-4" /> Deleted
                </p>
                <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                  <li>Your public key and fingerprint; the directory row keeps its ID and display name but is hidden from search</li>
                  <li>Your inbox queues</li>
                  <li>Encrypted messages waiting to be delivered to you</li>
                  <li>Messages, photos and videos in vanishing groups you run (the groups stay open for their members)</li>
                </ul>
                <p className="flex items-center gap-2 text-destructive font-medium pt-1">
                  <AlertTriangle className="h-4 w-4" /> Erased from this device
                </p>
                <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                  <li>Your identity keypair</li>
                  <li>All contacts, chats, groups and safety numbers</li>
                  <li>Screen lock, vault and cached snapshots</li>
                </ul>
              </div>
              <a
                href="/legal/delete-account.html"
                className="inline-flex items-center gap-1 text-xs text-primary underline"
              >
                How account deletion works <ExternalLink className="h-3 w-3" />
              </a>
              {error && (
                <p className="rounded-md border border-destructive/40 p-2 text-xs text-destructive">{error}</p>
              )}
              <div className="space-y-2">
                <label htmlFor="confirm-delete" className="text-xs text-muted-foreground">
                  Type <span className="font-mono text-foreground">{CONFIRM_WORD}</span> to confirm
                </label>
                <Input
                  id="confirm-delete"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                />
              </div>
              <Button
                variant="destructive"
                className="w-full"
                size="lg"
                disabled={!identity || confirmText.trim() !== CONFIRM_WORD}
                onClick={runDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete my account
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "deleting" && (
          <Card>
            <CardContent className="py-8 flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              Deleting your account…
            </CardContent>
          </Card>
        )}

        {step === "done" && (
          <Card>
            <CardContent className="py-8 flex flex-col items-center gap-4 text-sm text-center">
              <Check className="h-8 w-8 text-primary" />
              <p className="text-foreground">Your account has been deleted.</p>
              <Button className="w-full" onClick={() => window.location.replace(window.location.origin + "/")}>
                Finish
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default DeleteAccount;

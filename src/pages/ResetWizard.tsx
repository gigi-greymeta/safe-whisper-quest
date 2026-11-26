import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, AlertTriangle, Download, Trash2, Sparkles, Loader2, Check, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useCrypto } from "@/hooks/useCrypto";
import { eraseAllLocalData, restartFresh } from "@/lib/eraseDevice";
import { currentOwner, wipeServerData } from "@/lib/serverWipe";

type Step = "intro" | "backup" | "confirm" | "wiping" | "done";

const ResetWizard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { burnAllData } = useCrypto();
  const [step, setStep] = useState<Step>("intro");
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [progress, setProgress] = useState<string[]>([]);

  const addProgress = (msg: string) => setProgress((p) => [...p, msg]);

  const handleBackup = () => {
    const exportData: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("phantom_")) exportData[key] = localStorage.getItem(key);
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `phantom-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Backup downloaded", description: "Keep this file somewhere safe." });
  };

  const runWipe = async () => {
    setStep("wiping");
    setProgress([]);
    addProgress("Deleting your account on the server…");
    // Frees your display name for the new identity and removes your directory entry,
    // inbox and waiting messages. Best effort: offline, the local reset still goes ahead.
    const deleted = await wipeServerData(currentOwner());
    if (!deleted) addProgress("Couldn't reach the server; your old directory entry may remain.");
    addProgress("Stopping the connection and clearing your identity, contacts and messages…");
    // The full erase: realtime and in-memory copies first, then every storage area,
    // including the separate identity and contact mirrors that used to survive a reset.
    await eraseAllLocalData(burnAllData);
    addProgress("Removing your screen lock, vault and cached data…");
    addProgress("Reset complete.");
    // Short pause so the steps are readable, then restart; nothing is left to restore.
    await new Promise((r) => setTimeout(r, 900));
    setStep("done");
  };

  // Hard reload: a clean React tree, and bootstrap re-runs with nothing to restore.
  const handleFinish = restartFresh;

  return (
    <div className="dark flex flex-col min-h-screen bg-background">
      <div className="flex items-center gap-3 p-4 border-b bg-card/50 backdrop-blur-sm">
        {step !== "wiping" && step !== "done" && (
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5 text-primary" />
          </Button>
        )}
        <h1 className="text-lg font-semibold text-foreground">Reset Wizard</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 max-w-md w-full mx-auto space-y-4">
        {step === "intro" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Start Fresh, Safely
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-2">
                <p className="flex items-center gap-2 text-destructive font-medium">
                  <AlertTriangle className="h-4 w-4" /> What gets erased
                </p>
                <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                  <li>Your identity keypair and display name</li>
                  <li>All contacts and pinned safety numbers</li>
                  <li>All chat history and group messages</li>
                  <li>Screen lock PIN and sentry credential</li>
                  <li>Encrypted vault, cached snapshots and app caches</li>
                  <li>Your account on our server (directory entry, inbox and waiting messages) and the messages in vanishing groups you run, if you're online. The groups stay open for their members.</li>
                </ul>
              </div>
              <Button className="w-full" onClick={() => setStep("backup")}>
                Begin <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "backup" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" /> Step 1 — Optional Backup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Download an encrypted snapshot of your current identity and
                messages. You can import this later to restore.
              </p>
              <Button variant="outline" className="w-full" onClick={handleBackup}>
                <Download className="h-4 w-4 mr-2" /> Download Backup
              </Button>
              <Separator />
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setStep("intro")}>
                  Back
                </Button>
                <Button className="flex-1" onClick={() => setStep("confirm")}>
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "confirm" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <ShieldOff className="h-4 w-4" /> Step 2 — Confirm Wipe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox checked={ack1} onCheckedChange={(v) => setAck1(!!v)} className="mt-0.5" />
                <span className="text-muted-foreground">
                  I understand my identity, contacts, and messages will be
                  permanently destroyed.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox checked={ack2} onCheckedChange={(v) => setAck2(!!v)} className="mt-0.5" />
                <span className="text-muted-foreground">
                  I have downloaded a backup or accept losing my data forever.
                </span>
              </label>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Type <span className="font-mono text-destructive">RESET</span> to confirm:
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="RESET"
                  className="text-center font-mono"
                  autoCapitalize="characters"
                />
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setStep("backup")}>
                  Back
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={!ack1 || !ack2 || confirmText.trim().toUpperCase() !== "RESET"}
                  onClick={() => void runWipe()}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Wipe Now
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "wiping" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-primary animate-spin" /> Wiping…
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {progress.map((line, i) => (
                <div key={i} className="flex items-center gap-2 text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>{line}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {step === "done" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-primary">
                <Check className="h-4 w-4" /> Reset Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                All local data has been securely erased.
              </p>
              <Button className="w-full" size="lg" onClick={handleFinish}>
                Reload & Create New Identity <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ResetWizard;

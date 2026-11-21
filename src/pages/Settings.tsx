import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCrypto } from "@/hooks/useCrypto";
import { ArrowLeft, Shield, Flame, Key, Timer, Info, Lock, AlertTriangle, LogOut, Database, HardDrive, Sparkles, Activity, ListChecks, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import QRCodeDisplay from "@/components/QRCode";
import KeyDisplay from "@/components/KeyDisplay";
import DisappearingTimerSelect from "@/components/DisappearingTimer";
import PinSetup from "@/components/PinSetup";
import PanicWipeButton from "@/components/PanicWipeButton";
import VaultExport from "@/components/VaultExport";
import AdminConfigExport from "@/components/AdminConfigExport";
import StorageHealth from "@/components/StorageHealth";
import MessagingReadinessChecklist from "@/components/MessagingReadinessChecklist";
import NotificationSettings from "@/components/NotificationSettings";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bell, User } from "lucide-react";
import { isLockEnabled, disableLock, hasPanicPin, removePanicPin } from "@/store/lock";
import { isDebugConsoleEnabled, enableDebugConsole, disableDebugConsole } from "@/lib/debugConsole";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Settings = () => {
  const { state, setDisappearTimer, burnAllData, signOut } = useCrypto();
  const navigate = useNavigate();
  const [lockEnabled, setLockEnabled] = useState(isLockEnabled());
  const [panicEnabled, setPanicEnabled] = useState(hasPanicPin());
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinSetupMode, setPinSetupMode] = useState<"main" | "panic">("main");
  const [debugConsole, setDebugConsole] = useState(isDebugConsoleEnabled());

  const handleToggleDebug = async (checked: boolean) => {
    if (checked) {
      try {
        await enableDebugConsole();
        setDebugConsole(true);
      } catch {
        setDebugConsole(false);
      }
    } else {
      disableDebugConsole();
      setDebugConsole(false);
    }
  };

  useEffect(() => {
    if (state.initialized && !state.identity) {
      navigate("/", { replace: true });
    }
  }, [navigate, state.identity, state.initialized]);

  if (!state.identity) return null;

  const handleBurn = () => {
    burnAllData();
    disableLock();
    navigate("/");
  };

  const handlePanicWipe = () => {
    localStorage.clear();
    disableLock();
    window.location.reload();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  const handleToggleLock = (checked: boolean) => {
    if (checked) {
      setPinSetupMode("main");
      setShowPinSetup(true);
    } else {
      disableLock();
      setLockEnabled(false);
      setPanicEnabled(false);
    }
  };

  const handleTogglePanic = (checked: boolean) => {
    if (checked) {
      setPinSetupMode("panic");
      setShowPinSetup(true);
    } else {
      removePanicPin();
      setPanicEnabled(false);
    }
  };

  if (showPinSetup) {
    return (
      <PinSetup
        mode={pinSetupMode}
        onComplete={() => {
          setShowPinSetup(false);
          if (pinSetupMode === "main") {
            setLockEnabled(true);
          } else {
            setPanicEnabled(true);
          }
        }}
        onSkip={() => setShowPinSetup(false)}
      />
    );
  }

  return (
    <div className="dark flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-card/50 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Tabs defaultValue="identity" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="identity" className="text-xs gap-1">
              <User className="h-3.5 w-3.5" /> Identity
            </TabsTrigger>
            <TabsTrigger value="security" className="text-xs gap-1">
              <Shield className="h-3.5 w-3.5" /> Security
            </TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs gap-1">
              <Bell className="h-3.5 w-3.5" /> Alerts
            </TabsTrigger>
            <TabsTrigger value="data" className="text-xs gap-1">
              <Database className="h-3.5 w-3.5" /> Data
            </TabsTrigger>
          </TabsList>

          {/* ---------------- Identity tab ---------------- */}
          <TabsContent value="identity" className="space-y-4 mt-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" /> Your Identity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <p className="font-semibold text-foreground">{state.identity.displayName}</p>
              <p className="text-xs text-muted-foreground">
                Created {new Date(state.identity.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex justify-center">
              <QRCodeDisplay value={state.identity.publicKeyFingerprint} size={140} />
            </div>
            <KeyDisplay fingerprint={state.identity.publicKeyFingerprint} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Storage Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StorageHealth />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" /> Messaging Readiness
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MessagingReadinessChecklist />
          </CardContent>
        </Card>
          </TabsContent>

          {/* ---------------- Security tab ---------------- */}
          <TabsContent value="security" className="space-y-4 mt-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" /> Screen Lock
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">Screen Lock</p>
                <p className="text-xs text-muted-foreground">
                  Require PIN or passphrase to open
                </p>
              </div>
              <Switch checked={lockEnabled} onCheckedChange={handleToggleLock} />
            </div>
            {lockEnabled && (
              <>
                <Separator />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.dispatchEvent(new Event("phantom:lock"))}
                >
                  <Lock className="h-4 w-4 mr-2" /> Lock Now
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full">
                      <LogOut className="h-4 w-4 mr-2" /> Sign Out
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="dark">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Sign out of Phantom?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your encrypted vault stays on this device. Reopening
                        the app will require your passcode — you will not be
                        dropped back into Create Identity unless you Reset.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handleSignOut()}>
                        Sign Out
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      Sentry Mode
                    </p>
                    <p className="text-xs text-muted-foreground">
                      A decoy credential that silently wipes all data and shows a fresh install
                    </p>
                  </div>
                  <Switch checked={panicEnabled} onCheckedChange={handleTogglePanic} />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  When the sentry credential is entered at the lock screen, all local data is securely erased and the app reloads to its first-launch state — no error, no warning.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" /> Disappearing Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Default timer</p>
              <DisappearingTimerSelect value={state.disappearTimer} onChange={setDisappearTimer} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" /> Security Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              "ECDH P-256 key exchange",
              "AES-256-GCM message encryption",
              "HMAC-SHA256 message authentication",
              "PBKDF2 key-stretched PIN (100k iterations)",
              "AES-256-GCM encrypted localStorage vault",
              "Per-session ephemeral keys (forward secrecy)",
              "TOFU key pinning with MITM warnings",
              "Sentry Mode — decoy credential silently wipes all data",
              "All data stored locally — never sent to any server",
              "No phone number or email required",
              "Zero analytics or tracking",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <Shield className="h-3 w-3 mt-1 text-primary shrink-0" />
                <p className="text-xs text-muted-foreground">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>
          </TabsContent>

          {/* ---------------- Notifications tab ---------------- */}
          <TabsContent value="notifications" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" /> Message Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <NotificationSettings />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Data tab ---------------- */}
          <TabsContent value="data" className="space-y-4 mt-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> Vault Backup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VaultExport />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" /> Account Backup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AdminConfigExport />
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bug className="h-4 w-4 text-primary" /> Debug Console
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="pr-3">
                <p className="text-sm text-foreground">On-screen console</p>
                <p className="text-xs text-muted-foreground">
                  Show an in-app developer console (Eruda) to view logs, network and errors directly on this device.
                </p>
              </div>
              <Switch checked={debugConsole} onCheckedChange={handleToggleDebug} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Loads from a public CDN only when enabled. Stays off by default.
            </p>
          </CardContent>
        </Card>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full" size="lg">
              <Flame className="h-4 w-4 mr-2" /> Burn All Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="dark">
            <AlertDialogHeader>
              <AlertDialogTitle>Burn All Data?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your identity, all contacts, all messages, and your PIN. 
                This action cannot be undone. Your keypair will be destroyed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBurn} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Burn Everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <PanicWipeButton onWipe={handlePanicWipe} />

        <Button
          variant="outline"
          className="w-full"
          size="lg"
          onClick={() => navigate("/reset")}
        >
          <Sparkles className="h-4 w-4 mr-2" /> Reset Wizard
        </Button>
          </TabsContent>
        </Tabs>

        <p className="text-[10px] text-muted-foreground text-center pb-4">
          Phantom v1.0 — Inspired by Signal & SimpleX protocols
        </p>
      </div>
    </div>
  );
};

export default Settings;

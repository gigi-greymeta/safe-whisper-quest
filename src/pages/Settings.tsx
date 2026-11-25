import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCrypto } from "@/hooks/useCrypto";
import { ArrowLeft, Shield, Flame, Key, Timer, Info, Lock, AlertTriangle, LogOut, Database, HardDrive, Sparkles, Activity, ListChecks, Bug, Trash2, FileText, CreditCard } from "lucide-react";
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
import DisguiseSettings from "@/components/DisguiseSettings";
import CollapsibleCard from "@/components/CollapsibleCard";
import { wipeDeviceCaches } from "@/lib/deviceWipe";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bell, User } from "lucide-react";
import { isLockEnabled, disableLock, hasPanicPin, removePanicPin } from "@/store/lock";
import { useTier } from "@/hooks/useTier";
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
  const { tier, has } = useTier();
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

  const handlePanicWipe = async () => {
    localStorage.clear();
    disableLock();
    try {
      await wipeDeviceCaches();
    } catch {
      // Best effort: the reload still happens.
    }
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
    // Setting up a panic PIN needs Premium. One set earlier keeps working after a downgrade,
    // so someone relying on it under duress isn't left with a PIN that silently does nothing.
    if (checked && !has("panicPin")) {
      navigate("/upgrade");
      return;
    }
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
          <ArrowLeft className="h-5 w-5 text-primary" />
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
              <QRCodeDisplay value={state.identity.publicKeyFingerprint} />
            </div>
            <KeyDisplay fingerprint={state.identity.publicKeyFingerprint} />
          </CardContent>
        </Card>

        <CollapsibleCard icon={<Activity className="h-4 w-4 text-primary" />} title="Storage Health">
          <StorageHealth />
        </CollapsibleCard>

        <CollapsibleCard icon={<ListChecks className="h-4 w-4 text-primary" />} title="Messaging Readiness">
          <MessagingReadinessChecklist />
        </CollapsibleCard>
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
                  Require a PIN to open
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
                      {!has("panicPin") && <span className="text-[10px] uppercase tracking-wider text-primary">Premium</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Wipe all data and delete your account.
                    </p>
                  </div>
                  <Switch checked={panicEnabled} onCheckedChange={handleTogglePanic} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <DisguiseSettings />

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

        <CollapsibleCard icon={<Info className="h-4 w-4 text-primary" />} title="Security Info" contentClassName="space-y-2">
          {[
            "ECDH P-256 key exchange",
            "AES-256-GCM message encryption",
            "HMAC-SHA256 message authentication",
            "Argon2id key-stretched PIN, with lockouts after failed attempts",
            "AES-256-GCM encrypted on-device vault",
            "Per-session ephemeral keys (forward secrecy)",
            "TOFU key pinning with MITM warnings; directory keys are checked against their fingerprint",
            "Sentry Mode — a decoy PIN silently wipes all data",
           "Vanishing group messages are kept encrypted on the relay for 48 hours so members can catch up",
            "Zero analytics or tracking",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2">
              <Shield className="h-3 w-3 mt-1 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">{item}</p>
            </div>
          ))}
        </CollapsibleCard>
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
                <p className="text-xs text-muted-foreground">
                  Show an in-app developer console (Eruda)
                </p>
              </div>
              <Switch checked={debugConsole} onCheckedChange={handleToggleDebug} />
            </div>
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
                This will permanently delete all data.
                This action cannot be undone.
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

        <Button variant="outline" className="w-full" size="lg" onClick={() => navigate("/upgrade")}>
          <CreditCard className="h-4 w-4 mr-2" /> Plan: {tier === "free" ? "Free" : tier === "standard" ? "Standard" : "Premium"}
        </Button>

        <Button
          variant="outline"
          className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
          size="lg"
          onClick={() => navigate("/settings/delete-account")}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete Account
        </Button>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Legal &amp; Privacy
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <a className="text-primary underline" href="/legal/privacy.html">Privacy Policy</a>
            <a className="text-primary underline" href="/legal/terms.html">Terms of Service</a>
            <a className="text-primary underline" href="/legal/delete-data.html">Data Deletion</a>
            <a className="text-primary underline" href="/legal/delete-account.html">Account Deletion</a>
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;

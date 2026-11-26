import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCrypto } from "@/hooks/useCrypto";
import { UserPlus, Shield, Search, ScanLine, QrCode, MessageSquare, ShieldCheck, Trash2, UserX, BadgeCheck, Flag, Ban } from "lucide-react";
import ReportDialog from "@/components/ReportDialog";
import { readableForReport } from "@/lib/reportText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import ContactCard from "@/components/ContactCard";
import AppTabBar from "@/components/AppTabBar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import RelayStatusIndicator from "@/components/RelayStatusIndicator";
import { useToast } from "@/hooks/use-toast";
import { sendRequest } from "@/lib/requests";
import { checkPinnedKey } from "@/store/keyPinning";
import QRScanner from "@/components/QRScanner";
import QRCodeDisplay from "@/components/QRCode";
import { parseIdentityCode } from "@/lib/qrCodes";
import { lookupPublicKey } from "@/services/relay";
import { updateContact, type Contact } from "@/store/contacts";

const Contacts = () => {
  const { state, addContact, addContactFromRegistry, removeContact, blockContact, getDecryptedMessages, searchRegisteredUsers, checkContactAccounts } = useCrypto();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reporting, setReporting] = useState<{ contact: Contact; messages: { from: string; text: string; at: number }[] } | null>(null);

  /** Report from the contact's details: offer their recent messages from this phone. */
  const openReport = async (contactId: string) => {
    const contact = state.contacts.find((c) => c.id === contactId);
    if (!contact) return;
    const msgs = await getDecryptedMessages(contactId).catch(() => []);
    setReporting({
      contact,
      messages: msgs.filter((m) => !m.fromMe).map((m) => ({ from: contact.displayName, text: readableForReport(m.text), at: m.timestamp })),
    });
  };
  const navigate = useNavigate();
  const { toast } = useToast();

  /** Let them know you've added them, so they can accept and see your messages. */
  const announceTo = (fingerprint: string) => {
    const me = state.identity;
    if (!me) return;
    void sendRequest({ fingerprint: me.publicKeyFingerprint, privateKey: me.keyPair.privateKey }, fingerprint, { t: "contact", name: me.displayName });
  };
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ fingerprint: string; display_name: string; public_key_jwk: any }>>([]);
  const [searching, setSearching] = useState(false);
  const [addTab, setAddTab] = useState("search");
  const [scanning, setScanning] = useState(false);
  const [showMyCode, setShowMyCode] = useState(false);
  const [scannedKey, setScannedKey] = useState("");

  useEffect(() => {
    if (state.initialized && !state.identity) {
      navigate("/", { replace: true });
    }
  }, [navigate, state.identity, state.initialized]);

  // Picks up contacts who have deleted their account since the last check.
  useEffect(() => {
    void checkContactAccounts();
  }, [checkContactAccounts]);

  if (!state.identity) return null;

  const opened = state.contacts.find((c) => c.id === openId) ?? null;
  const shown = [...state.contacts]
    .filter((c) => c.displayName.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => {
      // Changed keys first (they need attention), then A to Z.
      const aMismatch = checkPinnedKey(a.publicKeyFingerprint, a.publicKey) === "mismatch" ? 0 : 1;
      const bMismatch = checkPinnedKey(b.publicKeyFingerprint, b.publicKey) === "mismatch" ? 0 : 1;
      return aMismatch - bMismatch || a.displayName.localeCompare(b.displayName);
    });

  const handleAdd = async () => {
    if (!newName.trim() || !newKey.trim()) return;
    try {
      const contact = await addContact(newName.trim(), newKey.trim());
      announceTo(contact.publicKeyFingerprint);
      // A key that came from scanning their screen was verified in person.
      if (scannedKey && newKey.trim() === scannedKey) updateContact(contact.id, { verified: true });
      setScannedKey("");
      setShowAdd(false);
      setNewName("");
      setNewKey("");
      toast({ title: "Contact added", description: `${newName} has been added securely.` });
    } catch {
      toast({ title: "Invalid key", description: "Could not parse the public key.", variant: "destructive" });
    }
  };

  /**
   * A scanned identity code is the contact's full public key, read straight off
   * their screen, so no server is trusted for it and the contact is marked
   * verified. The relay directory is asked only for their display name.
   */
  const handleScannedCode = async (text: string): Promise<string | null> => {
    const scanned = parseIdentityCode(text);
    if (!scanned) return "That isn't a Phantom contact code. Ask them to open Settings > Identity.";
    if (scanned.fingerprint === state.identity?.publicKeyFingerprint) return "That's your own code.";
    const existing = state.contacts.find((c) => c.publicKeyFingerprint === scanned.fingerprint);
    if (existing) {
      updateContact(existing.id, { verified: true });
      setShowAdd(false);
      toast({ title: "Already a contact", description: `${existing.displayName} is now marked as verified in person.` });
      return null;
    }
    const listed = await Promise.race([
      lookupPublicKey(scanned.fingerprint).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    const name = typeof listed?.display_name === "string" ? listed.display_name.trim() : "";
    if (!name) {
      setNewKey(text.trim());
      setScannedKey(text.trim());
      setNewName("");
      setAddTab("manual");
      toast({ title: "Code scanned", description: "Enter a name for this contact to finish adding them." });
      return null;
    }
    try {
      const contact = await addContactFromRegistry(scanned.fingerprint, name, scanned.publicKey);
      announceTo(contact.publicKeyFingerprint);
      updateContact(contact.id, { verified: true });
      setShowAdd(false);
      toast({ title: "Contact added", description: `${name} was added and verified in person.` });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Couldn't add this contact.";
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchRegisteredUsers(searchQuery.trim());
      const newestByName = new Map<string, { fingerprint: string; display_name: string; public_key_jwk: any; last_seen_at?: string }>();
      for (const result of results as Array<{ fingerprint: string; display_name: string; public_key_jwk: any; last_seen_at?: string }>) {
        const existing = newestByName.get(result.display_name.toLowerCase());
        const resultSeen = result.last_seen_at ? new Date(result.last_seen_at).getTime() : 0;
        const existingSeen = existing?.last_seen_at ? new Date(existing.last_seen_at).getTime() : 0;
        if (!existing || resultSeen >= existingSeen) {
          newestByName.set(result.display_name.toLowerCase(), result);
        }
      }
      // Filter out self and already-added contacts
      const filtered = Array.from(newestByName.values()).filter(
        (r) =>
          r.fingerprint !== state.identity?.publicKeyFingerprint &&
          !state.contacts.some((c) => c.publicKeyFingerprint === r.fingerprint)
      );
      setSearchResults(filtered);
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const handleAddFromRegistry = async (result: { fingerprint: string; display_name: string; public_key_jwk: any }) => {
    try {
      await addContactFromRegistry(result.fingerprint, result.display_name, result.public_key_jwk);
      announceTo(result.fingerprint);
      setSearchResults((prev) => prev.filter((r) => r.fingerprint !== result.fingerprint));
      setShowAdd(false);
      toast({ title: "Contact added", description: `${result.display_name} connected via anonymous queue.` });
    } catch (err) {
      console.error("[addContactFromRegistry] failed:", err);
      toast({
        title: "Couldn't add contact",
        description: err instanceof Error ? err.message : "Unknown error establishing channel.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="dark flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card/50 backdrop-blur-sm">
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground">Contacts</h1>
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-muted-foreground">{state.contacts.length} {state.contacts.length === 1 ? "contact" : "contacts"}</p>
            <RelayStatusIndicator status={state.relayStatus} compact className="border-0 bg-transparent px-0 py-0" />
          </div>
        </div>
        <Button size="icon" variant="outline" onClick={() => setShowAdd(true)} aria-label="Add contact" className="text-primary hover:text-primary">
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>

      {/* Address book */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {state.contacts.length > 0 && (
          <div className="px-1 pb-2">
            <Input placeholder="Search contacts" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        )}
        <div className="space-y-1">
          {shown.map((contact) => (
            <ContactCard key={contact.id} contact={contact} onClick={() => setOpenId(contact.id)} />
          ))}
        </div>
        {state.contacts.length > 0 && shown.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No contacts match "{filter.trim()}"</p>
        )}

        {state.contacts.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center p-8 space-y-3">
            <Shield className="h-12 w-12 text-muted-foreground/60" />
            <p className="text-muted-foreground text-sm">No contacts yet</p>
            <p className="text-muted-foreground text-xs max-w-[220px]">
              Scan someone's QR code, search their display name, or paste their public key.
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
              <UserPlus className="h-4 w-4 mr-2" /> Add Contact
            </Button>
          </div>
        )}
      </div>

      <AppTabBar />

      {/* Contact details */}
      <Sheet open={!!opened} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent side="bottom" className="dark pb-[calc(1.5rem+var(--safe-bottom))]">
          {opened && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-1.5">
                  {opened.displayName}
                  {opened.verified && !opened.accountDeleted && <BadgeCheck className="h-4 w-4 text-primary" />}
                </SheetTitle>
                <SheetDescription className="font-mono text-[11px] break-all">
                  {opened.publicKeyFingerprint.slice(0, 48)}...
                </SheetDescription>
              </SheetHeader>
              {opened.accountDeleted && (
                <div className="mt-3 flex gap-2 rounded-lg border border-muted p-3 text-xs text-muted-foreground">
                  <UserX className="h-4 w-4 shrink-0" />
                  <span>
                    {opened.displayName} deleted their Phantom account.
                  </span>
                </div>
              )}
              {opened.addedFromGroup && !opened.accountDeleted && (
                <p className="mt-3 text-xs text-muted-foreground">Added from the group "{opened.addedFromGroup}".</p>
              )}
              <div className="mt-4 grid gap-2">
                <Button onClick={() => navigate(`/chat/${opened.id}`)}>
                  <MessageSquare className="h-4 w-4 mr-2" /> {opened.accountDeleted ? "View chat" : "Message"}
                </Button>
                {!opened.accountDeleted && (
                  <Button variant="outline" onClick={() => navigate(`/chat/${opened.id}/safety`)}>
                    <ShieldCheck className="h-4 w-4 mr-2 text-primary" /> Verify safety number
                  </Button>
                )}
                <Button variant="outline" onClick={() => void openReport(opened.id)}>
                  <Flag className="h-4 w-4 mr-2 text-primary" /> Report
                </Button>
                <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmBlock(true)}>
                  <Ban className="h-4 w-4 mr-2" /> Block
                </Button>
                <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmRemove(true)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Remove contact
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmBlock} onOpenChange={setConfirmBlock}>
        <AlertDialogContent className="dark">
          <AlertDialogHeader>
            <AlertDialogTitle>Block {opened?.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Removed from your contacts and their posts are hidden in groups.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (opened) {
                  blockContact(opened.id);
                  toast({ title: `${opened.displayName} blocked` });
                }
                setOpenId(null);
              }}
            >
              Block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {reporting && (
        <ReportDialog
          open
          onClose={() => setReporting(null)}
          context="chat"
          person={{ fingerprint: reporting.contact.publicKeyFingerprint, name: reporting.contact.displayName }}
          recentMessages={reporting.messages}
          onBlock={() => {
            blockContact(reporting.contact.id);
            setOpenId(null);
          }}
        />
      )}

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent className="dark">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {opened?.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes your chat and closes your encrypted channel. 
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (opened) removeContact(opened.id);
                setOpenId(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Contact Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="dark max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setScanning(true)}>
              <ScanLine className="text-primary h-4 w-4 mr-2" /> Scan QR code
            </Button>
            <Button variant="outline" onClick={() => setShowMyCode(true)}>
              <QrCode className="text-primary h-4 w-4 mr-2" /> Show my code
            </Button>
          </div>

          <Tabs value={addTab} onValueChange={setAddTab} className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="search" className="flex-1">
                <Search className="text-primary h-3 w-3 mr-1" /> Search Relay
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex-1">
                <Shield className="text-primary h-3 w-3 mr-1" /> Paste Key
              </TabsTrigger>
            </TabsList>

            <TabsContent value="search" className="space-y-3 mt-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Search by display name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()} size="icon">
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {searchResults.map((result) => (
                    <div
                      key={result.fingerprint}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{result.display_name}</p>
                        <p className="text-[10px] font-mono text-muted-foreground truncate">
                          {result.fingerprint.slice(0, 16)}...
                        </p>
                      </div>
                      <Button size="sm" onClick={() => handleAddFromRegistry(result)}>
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {searching && <p className="text-xs text-muted-foreground text-center">Searching relay...</p>}
              {!searching && searchResults.length === 0 && searchQuery && (
                <p className="text-xs text-muted-foreground text-center">No users found</p>
              )}
            </TabsContent>

            <TabsContent value="manual" className="space-y-3 mt-3">
              <Input
                placeholder="Contact name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Textarea
                placeholder="Paste public key (base64)"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
              <Button onClick={handleAdd} disabled={!newName.trim() || !newKey.trim()} className="w-full">
                Establish Encrypted Channel
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <QRScanner
        open={scanning}
        onOpenChange={setScanning}
        title="Scan a contact's code"
        description="Point your camera at the QR code in their Settings > Identity."
        onCode={handleScannedCode}
      />

      <Dialog open={showMyCode} onOpenChange={setShowMyCode}>
        <DialogContent className="dark max-w-sm">
          <DialogHeader>
            <DialogTitle>Your contact code</DialogTitle>
            <DialogDescription>Let the other person scan this with Phantom to add you.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            <QRCodeDisplay value={state.identity.publicKeyFingerprint} />
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Contacts;

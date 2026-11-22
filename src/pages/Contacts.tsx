import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCrypto } from "@/hooks/useCrypto";
import { ArrowLeft, UserPlus, Shield, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import ContactCard from "@/components/ContactCard";
import RelayStatusIndicator from "@/components/RelayStatusIndicator";
import { useToast } from "@/hooks/use-toast";
import { checkPinnedKey } from "@/store/keyPinning";
import { useTier } from "@/hooks/useTier";

const Contacts = () => {
  const { state, addContact, addContactFromRegistry, removeContact, searchRegisteredUsers, createGroupChat } = useCrypto();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { has } = useTier();
  const [showAdd, setShowAdd] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ fingerprint: string; display_name: string; public_key_jwk: any }>>([]);
  const [searching, setSearching] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  useEffect(() => {
    if (state.initialized && !state.identity) {
      navigate("/", { replace: true });
    }
  }, [navigate, state.identity, state.initialized]);

  if (!state.identity) return null;

  const handleAdd = async () => {
    if (!newName.trim() || !newKey.trim()) return;
    try {
      await addContact(newName.trim(), newKey.trim());
      setShowAdd(false);
      setNewName("");
      setNewKey("");
      toast({ title: "Contact added", description: `${newName} has been added securely.` });
    } catch {
      toast({ title: "Invalid key", description: "Could not parse the public key.", variant: "destructive" });
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
    <div className="dark flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-card/50 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Back" className="text-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground">Contacts</h1>
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-muted-foreground">{state.contacts.length} encrypted channels</p>
            <RelayStatusIndicator status={state.relayStatus} compact className="border-0 bg-transparent px-0 py-0" />
          </div>
        </div>
        <Button size="icon" variant="outline" onClick={() => (has("groupChats") ? setShowCreateGroup(true) : navigate("/upgrade"))} title="Create group" aria-label="Create group" className="text-primary hover:text-primary">
          <Users className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" onClick={() => setShowAdd(true)} aria-label="Add contact" className="text-primary hover:text-primary">
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>

      {/* Contact & Group List */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Groups */}
        {state.groups.length > 0 && (
          <div className="mb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 mb-1">Groups</p>
            <div className="space-y-1">
              {state.groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => navigate(`/group/${group.id}`)}
                  className="flex items-center gap-3 w-full rounded-xl p-3 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{group.name}</p>
                    <p className="text-xs text-muted-foreground">{group.memberIds.length + 1} members · E2E</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contacts */}
        {state.contacts.length > 0 && (
          <div>
            {state.groups.length > 0 && (
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 mb-1">Direct</p>
            )}
            <div className="space-y-1">
              {[...state.contacts]
                .sort((a, b) => {
                  const aMismatch = checkPinnedKey(a.publicKeyFingerprint, a.publicKey) === "mismatch" ? 0 : 1;
                  const bMismatch = checkPinnedKey(b.publicKeyFingerprint, b.publicKey) === "mismatch" ? 0 : 1;
                  return aMismatch - bMismatch;
                })
                .map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  onClick={() => navigate(`/chat/${contact.id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {state.contacts.length === 0 && state.groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
            <Shield className="h-12 w-12 text-muted-foreground/60" />
            <p className="text-muted-foreground text-sm">No contacts yet</p>
            <p className="text-muted-foreground text-xs max-w-[200px]">
              Search for users on the relay or add a contact by pasting their public key.
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
              <UserPlus className="h-4 w-4 mr-2" /> Add Contact
            </Button>
          </div>
        )}
      </div>

      {/* Add Contact Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="dark max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>
              Find users on the relay or paste a public key directly.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="search" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="search" className="flex-1">
                <Search className="h-3 w-3 mr-1" /> Search Relay
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex-1">
                <Shield className="h-3 w-3 mr-1" /> Paste Key
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

      {/* Create Group Dialog */}
      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent className="dark max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
            <DialogDescription>
              Select members for an encrypted group chat. Messages are sent individually to each member via pairwise queues.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            {state.contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center">Add contacts first to create a group.</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {state.contacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/30 transition-colors"
                  >
                    <Checkbox
                      checked={selectedMembers.includes(contact.id)}
                      onCheckedChange={(checked) => {
                        setSelectedMembers((prev) =>
                          checked
                            ? [...prev, contact.id]
                            : prev.filter((id) => id !== contact.id)
                        );
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{contact.displayName}</p>
                      <p className="text-[10px] font-mono text-muted-foreground truncate">
                        {contact.publicKeyFingerprint.slice(0, 16)}...
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <Button
              className="w-full"
              disabled={!groupName.trim() || selectedMembers.length === 0}
              onClick={() => {
                const group = createGroupChat(groupName.trim(), selectedMembers);
                setShowCreateGroup(false);
                setGroupName("");
                setSelectedMembers([]);
                toast({ title: "Group created", description: `${group.name} with ${group.memberIds.length} members.` });
                navigate(`/group/${group.id}`);
              }}
            >
              <Users className="h-4 w-4 mr-2" />
              Create Encrypted Group
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Contacts;

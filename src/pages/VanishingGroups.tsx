import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Crown, Plus, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCrypto } from "@/hooks/useCrypto";
import { useTier } from "@/hooks/useTier";
import { useToast } from "@/hooks/use-toast";
import { useVanishingGroups } from "@/contexts/VanishingGroupsContext";

/** List of vanishing groups and pending invites. Creating a group needs Premium; anyone invited can join. */
const VanishingGroups = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { state } = useCrypto();
  const { has } = useTier();
  const { groups, invites, myFingerprint, createGroup, acceptInvite, declineInvite } = useVanishingGroups();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const group = await createGroup(name.trim(), selected);
      setCreating(false);
      setName("");
      setSelected([]);
      toast({ title: "Group created", description: "Invites sent. People appear in the group once they accept." });
      navigate(`/vanishing/${group.id}`);
    } catch (e) {
      toast({ title: "Couldn't create the group", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dark flex flex-col min-h-screen bg-background">
      <div className="flex items-center gap-3 p-4 border-b bg-card/50 pt-[max(1rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-primary" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground">Vanishing groups</h1>
          <p className="text-xs text-muted-foreground">Messages, photos and videos are wiped after 48 hours</p>
        </div>
        <Button size="icon" variant="outline" aria-label="New group" onClick={() => (has("vanishingGroups") ? setCreating(true) : navigate("/upgrade"))}>
          <Plus className="h-4 w-4 text-primary" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {invites.length > 0 && (
          <section>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">Invites</p>
            {invites.map((inv) => (
              <div key={inv.groupId} className="flex items-center gap-3 rounded-lg border p-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{inv.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {inv.accepted ? "Joining… waiting for the admin" : `From ${inv.adminName || "a contact"}`}
                  </p>
                </div>
                {!inv.accepted && (
                  <>
                    <Button size="icon" variant="ghost" aria-label="Decline" onClick={() => void declineInvite(inv.groupId)}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="icon" aria-label="Join" onClick={() => void acceptInvite(inv.groupId)}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </section>
        )}

        <section>
          {groups.length === 0 ? (
            <div className="text-center text-muted-foreground mt-16 space-y-2 px-6">
              <Timer className="h-10 w-10 mx-auto text-primary/50" />
              <p className="text-sm">No vanishing groups yet</p>
              <p className="text-xs">
                Everything posted is end-to-end encrypted, signed by its sender and permanently wiped from the server after 48 hours.
              </p>
            </div>
          ) : (
            [...groups]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => navigate(`/vanishing/${g.id}`)}
                  className="w-full flex items-center gap-3 rounded-lg p-3 hover:bg-muted/40 text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
                    <Timer className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                      {g.name}
                      {g.adminFingerprint === myFingerprint && <Crown className="h-3 w-3 text-amber-400" aria-label="You're the admin" />}
                    </p>
                    <p className="text-xs text-muted-foreground">{g.members.length} members · 48h</p>
                  </div>
                </button>
              ))
          )}
        </section>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="dark max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New vanishing group</DialogTitle>
            <DialogDescription>You'll be the admin: you can invite and remove people and delete the group.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Group name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            {state.contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Add contacts first, then invite them here.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1">
                {state.contacts.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded p-2 hover:bg-muted/40">
                    <Checkbox
                      checked={selected.includes(c.id)}
                      onCheckedChange={(on) => setSelected((s) => (on ? [...s, c.id] : s.filter((id) => id !== c.id)))}
                    />
                    <span className="text-sm text-foreground">{c.displayName}</span>
                  </label>
                ))}
              </div>
            )}
            <Button className="w-full" disabled={busy || !name.trim() || selected.length === 0} onClick={() => void create()}>
              Create and invite
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VanishingGroups;

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Contact } from "@/store/contacts";

interface GroupMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  /** Create a new group (asks for a name) or add people to an existing one. */
  mode: "create" | "add";
  /** Contacts already in the group, left out of the list when adding. */
  excludeIds?: string[];
  onConfirm: (memberIds: string[], name: string) => void;
}

/** Pick group members from the address book. Groups have no member limit. */
const GroupMembersDialog = ({ open, onOpenChange, contacts, mode, excludeIds = [], onConfirm }: GroupMembersDialogProps) => {
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const available = useMemo(
    () =>
      contacts
        .filter((c) => !c.accountDeleted && !excludeIds.includes(c.id))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [contacts, excludeIds]
  );
  const shown = available.filter((c) => c.displayName.toLowerCase().includes(filter.trim().toLowerCase()));
  const allShownSelected = shown.length > 0 && shown.every((c) => selected.includes(c.id));

  const close = (next: boolean) => {
    if (!next) {
      setName("");
      setFilter("");
      setSelected([]);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="dark max-w-sm max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New group" : "Add members"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Choose who's in the group."
              : "They'll see the group with the next messsage."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          {mode === "create" && (
            <Input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
          )}
          {available.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {mode === "create" ? "Add contacts first to create a group." : "Everyone in your contacts is already in this group."}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Input placeholder="Search contacts" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    setSelected((prev) =>
                      allShownSelected
                        ? prev.filter((id) => !shown.some((c) => c.id === id))
                        : [...new Set([...prev, ...shown.map((c) => c.id)])]
                    )
                  }
                >
                  {allShownSelected ? "Clear" : "All"}
                </Button>
              </div>
              <div className="space-y-2 overflow-y-auto min-h-0 flex-1 max-h-[45dvh]">
                {shown.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/30 transition-colors"
                  >
                    <Checkbox
                      checked={selected.includes(contact.id)}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => (checked ? [...prev, contact.id] : prev.filter((id) => id !== contact.id)))
                      }
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
            </>
          )}
          <Button
            className="w-full"
            disabled={selected.length === 0 || (mode === "create" && !name.trim())}
            onClick={() => {
              onConfirm(selected, name.trim());
              close(false);
            }}
          >
            <Users className="h-4 w-4 mr-2" />
            {mode === "create"
              ? `Create group${selected.length ? ` (${selected.length + 1} people)` : ""}`
              : `Add ${selected.length || ""} ${selected.length === 1 ? "person" : "people"}`.replace("  ", " ")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GroupMembersDialog;

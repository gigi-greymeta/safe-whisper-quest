import { useState } from "react";
import { Ban, Check, Loader2, MailQuestion, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { describeRequest, useRequests } from "@/contexts/RequestsContext";

/** Pending message requests and group invites from people who aren't contacts yet. */
const MessageRequests = () => {
  const { requests, accept, decline, blockSender } = useRequests();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (requests.length === 0) return null;

  return (
    <section className="mb-2 rounded-xl border border-primary/30 bg-primary/5 p-2">
      <p className="flex items-center gap-1.5 px-1 pb-1 text-[11px] font-medium uppercase tracking-wider text-primary">
        <MailQuestion className="h-3.5 w-3.5" /> Message requests ({requests.length})
      </p>
      <ul className="space-y-1">
        {[...requests]
          .sort((a, b) => b.receivedAt - a.receivedAt)
          .map((r) => (
            <li key={r.id} className="rounded-lg bg-card p-2.5">
              <p className="text-sm font-medium text-foreground">{describeRequest(r)}</p>
              {r.body.t === "contact" && r.body.preview && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">"{r.body.preview}"</p>
              )}
              <p className="mt-0.5 text-[10px] text-muted-foreground">
               Accept only if you know them.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={busy !== null}
                  onClick={() => {
                    setBusy(r.id);
                    void accept(r.id)
                      .catch((e) => toast({ title: "Couldn't accept", description: e instanceof Error ? e.message : undefined, variant: "destructive" }))
                      .finally(() => setBusy(null));
                  }}
                >
                  {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Accept</>}
                </Button>
                <Button size="sm" variant="outline" className="flex-1" disabled={busy !== null} onClick={() => decline(r.id)}>
                  <X className="h-4 w-4 mr-1" /> Decline
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  aria-label="Block"
                  disabled={busy !== null}
                  onClick={() => {
                    blockSender(r.id);
                    toast({ title: "Blocked", description: "You won't get requests from them. Unblock in Settings." });
                  }}
                >
                  <Ban className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
};

export default MessageRequests;

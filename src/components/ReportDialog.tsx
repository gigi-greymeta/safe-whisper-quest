import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { REPORT_REASONS, submitReport, type AbuseReport } from "@/lib/reports";

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  context: AbuseReport["context"];
  person: { fingerprint: string; name: string };
  /** Recent messages from this person the reporter may choose to include. */
  recentMessages: AbuseReport["messages"];
  /** Offer "Also block"; called after the report is sent if ticked. */
  onBlock?: () => void;
}

const ReportDialog = ({ open, onClose, context, person, recentMessages, onBlock }: ReportDialogProps) => {
  const { toast } = useToast();
  const [reason, setReason] = useState<AbuseReport["reason"]>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [include, setInclude] = useState(true);
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const toInclude = recentMessages.slice(-10);

  const send = async () => {
    setSending(true);
    try {
      await submitReport({
        context,
        reportedFingerprint: person.fingerprint,
        reportedName: person.name,
        reason,
        details: details.trim(),
        messages: include ? toInclude : [],
        contact: contact.trim() || undefined,
      });
      if (alsoBlock && onBlock) onBlock();
      toast({ title: "Report sent", description: "Thank you. We review every report, usually within 24 hours." });
      onClose();
    } catch (e) {
      toast({ title: "Report not sent", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="dark max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report {person.name || "this person"}</DialogTitle>
          <DialogDescription>
            Messages are end-to-end encrypted, so we can only see what you choose to include in this report.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={reason} onValueChange={(v) => setReason(v as AbuseReport["reason"])}>
            {REPORT_REASONS.map((r) => (
              <div key={r} className="flex items-center gap-2">
                <RadioGroupItem value={r} id={`reason-${r}`} />
                <Label htmlFor={`reason-${r}`} className="text-sm font-normal">{r}</Label>
              </div>
            ))}
          </RadioGroup>
          <Textarea placeholder="What happened? (optional)" maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
          {toInclude.length > 0 && (
            <label className="flex items-start gap-2 text-sm text-foreground">
              <Checkbox checked={include} onCheckedChange={(v) => setInclude(v === true)} className="mt-0.5" />
              <span>
                Include their last {toInclude.length} message{toInclude.length === 1 ? "" : "s"}
                <span className="block text-[11px] text-muted-foreground">These are sent to the Phantom team as plain text with the report.</span>
              </span>
            </label>
          )}
          {onBlock && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={alsoBlock} onCheckedChange={(v) => setAlsoBlock(v === true)} />
              Also block {person.name || "them"}
            </label>
          )}
          <Input placeholder="Email for a reply (optional)" type="email" value={contact} onChange={(e) => setContact(e.target.value)} />
          <Button className="w-full" variant="destructive" disabled={sending} onClick={() => void send()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;

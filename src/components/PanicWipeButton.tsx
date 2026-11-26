import { useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface PanicWipeButtonProps {
  onWipe: () => void;
}

const PanicWipeButton = ({ onWipe }: PanicWipeButtonProps) => {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleWipe = () => {
    setConfirming(true);
    // Small delay for dramatic effect, then wipe
    setTimeout(() => {
      onWipe();
    }, 300);
  };

  return (
    <>
      <Button
        variant="destructive"
        className="w-full"
        size="lg"
        onClick={() => setOpen(true)}
      >
        <Zap className="h-4 w-4 mr-2" /> Panic Pin
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="dark">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Zap className="h-5 w-5" /> Panic Pin
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
               <strong>Instantly and permanently</strong> destroy:
              </span>
              <span className="block text-destructive/80">
                • Your account on our server and the messages in vanishing groups you run (if online)
                <br />• All encryption keys and identity
                <br />• All contacts and pairwise queues
                <br />• All messages (sent and received)
                <br />• All group chats
                <br />• Vault encryption key
                <br />• Notes, PIN, panic PIN and app caches
              </span>
              <span className="block font-semibold text-destructive">
                This cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleWipe}
              disabled={confirming}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirming ? "Wiping..." : "Destroy Everything Now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PanicWipeButton;

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCrypto } from "@/hooks/useCrypto";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { getContacts } from "@/store/contacts";

/**
 * In-app alert for a new message from a contact while you're on another screen. Shows the
 * sender's name only, never the message, so nothing private appears over other screens.
 * (Alerts while the app is closed need push notifications, which Phantom doesn't use yet.)
 */
const IncomingMessageNotifier = () => {
  const { onIncomingMessage } = useCrypto();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    return onIncomingMessage((senderFingerprint) => {
      const contact = getContacts().find((c) => c.publicKeyFingerprint === senderFingerprint);
      if (!contact || location.pathname === `/chat/${contact.id}`) return;
      toast({
        title: `New message from ${contact.displayName}`,
        action: (
          <ToastAction altText="Open chat" onClick={() => navigate(`/chat/${contact.id}`)}>
            Open
          </ToastAction>
        ),
      });
    });
  }, [onIncomingMessage, location.pathname, navigate, toast]);

  return null;
};

export default IncomingMessageNotifier;

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCrypto } from "@/hooks/useCrypto";
import { ArrowLeft, Shield, Trash2, ShieldCheck, BadgeCheck, AlertTriangle, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import MessageBubble from "@/components/MessageBubble";
import ChatInput from "@/components/ChatInput";
import DisappearingTimerSelect from "@/components/DisappearingTimer";
import TypingIndicator from "@/components/TypingIndicator";
import PfsIndicator from "@/components/PfsIndicator";
import RatchetStatsDisplay from "@/components/RatchetStatsDisplay";
import { checkPinnedKey, acceptKeyChange } from "@/store/keyPinning";
import { getStatsForContact } from "@/store/ratchetStats";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import LogoMark from "@/components/LogoMark";
import RelayStatusIndicator from "@/components/RelayStatusIndicator";
import { useToast } from "@/hooks/use-toast";

interface DecryptedMsg {
  id: string;
  text: string;
  fromMe: boolean;
  timestamp: number;
  status: string;
  hmacVerified?: boolean | null;
}

const Chat = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const {
    state,
    sendMessage,
    getDecryptedMessages,
    setDisappearTimer,
    removeContact,
    onIncomingMessage,
    processIncomingMessages,
    sendReadReceipt,
    sendTypingIndicator,
  } = useCrypto();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [messages, setMessages] = useState<DecryptedMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyMismatch, setKeyMismatch] = useState(false);
  const [mismatchDismissed, setMismatchDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const contact = state.contacts.find((entry) => entry.id === contactId);

  // Check TOFU key pinning on mount
  useEffect(() => {
    if (contact) {
      const result = checkPinnedKey(contact.publicKeyFingerprint, contact.publicKey);
      setKeyMismatch(result === "mismatch");
    }
  }, [contact?.publicKeyFingerprint]);

  useEffect(() => {
    if (!state.identity) {
      navigate("/");
      return;
    }
    if (!contact) {
      navigate("/contacts");
      return;
    }

    processIncomingMessages().then(() => {
      loadMessages();
      if (contactId) sendReadReceipt(contactId).catch(console.error);
    });

    const unsubscribe = onIncomingMessage((senderFingerprint) => {
      if (contact && senderFingerprint === contact.publicKeyFingerprint) {
        loadMessages();
        if (contactId) sendReadReceipt(contactId).catch(console.error);
      }
    });

    return unsubscribe;
  }, [contactId, state.identity]);

  const loadMessages = async () => {
    if (!contactId) return;
    setLoading(true);
    try {
      const msgs = await getDecryptedMessages(contactId);
      setMessages(msgs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!contactId) return;
    try {
      await sendMessage(contactId, text);
      await loadMessages();
    } catch (err) {
      console.error("[Chat.handleSend] failed:", err);
      toast({
        title: "Message not sent",
        description:
          err instanceof Error
            ? err.message
            : "Unknown error reaching the relay. Check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  const handleSendFile = async (file: { name: string; type: string; data: string }) => {
    if (!contactId) return;
    const fileMessage = JSON.stringify({
      __type: "file_attachment",
      name: file.name,
      type: file.type,
      data: file.data,
    });
    try {
      await sendMessage(contactId, fileMessage);
      await loadMessages();
    } catch (err) {
      console.error("[Chat.handleSendFile] failed:", err);
      toast({
        title: "File not sent",
        description:
          err instanceof Error ? err.message : "Could not send file via the relay.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = () => {
    if (!contactId) return;
    removeContact(contactId);
    navigate("/contacts");
  };

  const handleAcceptKeyChange = () => {
    if (contact) {
      acceptKeyChange(contact.publicKeyFingerprint, contact.displayName, contact.publicKey);
      setKeyMismatch(false);
      setMismatchDismissed(false);
    }
  };

  const isContactTyping = contactId ? !!state.typingContacts[contactId] : false;

  const handleTyping = useCallback(() => {
    if (contactId) sendTypingIndicator(contactId).catch(console.error);
  }, [contactId, sendTypingIndicator]);

  if (!state.identity || !contact) return null;

  return (
    <div className="dark flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        {/* Top row: back, identity, primary actions */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/contacts")}
            aria-label="Back to contacts"
            className="text-foreground hover:text-primary shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <LogoMark size={32} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="font-semibold text-sm text-foreground truncate">{contact.displayName}</p>
              {contact.verified && (
                <BadgeCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/chat/${contactId}/safety`)}
            title="Verify safety number"
            aria-label="Verify safety number"
            className="text-primary hover:text-primary/80 shrink-0"
          >
            <ShieldCheck className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            aria-label="Delete conversation"
            className="text-destructive hover:text-destructive/80 shrink-0"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
        {/* Bottom row: status chips + disappearing timer */}
        <div className="flex items-center justify-between gap-2 px-3 pb-2 flex-wrap">
          <div className="flex items-center gap-2 text-[10px] text-foreground/80 flex-wrap">
            <div className="flex items-center gap-1">
              <Shield className="h-2.5 w-2.5 text-primary" />
              <span>E2E</span>
            </div>
            <PfsIndicator contactId={contactId!} />
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1 hover:text-primary transition-colors">
                  <RefreshCw className="h-2.5 w-2.5 text-primary" />
                  <span>{getStatsForContact(contactId!).dhRatchetCount} rotations</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="dark w-64 p-3" side="bottom">
                <RatchetStatsDisplay contactId={contactId!} />
              </PopoverContent>
            </Popover>
            <RelayStatusIndicator
              status={state.relayStatus}
              compact
              pendingCount={state.outboxPending}
              failedCount={state.outboxFailed}
              className="border-0 bg-transparent px-0 py-0"
            />
          </div>
          <DisappearingTimerSelect value={state.disappearTimer} onChange={setDisappearTimer} />
        </div>
      </div>

      {/* MITM Key Mismatch Warning Banner */}
      {keyMismatch && !mismatchDismissed && (
        <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-destructive">
                Security Warning: Key Changed
              </p>
              <p className="text-[11px] text-destructive/80 mt-0.5 leading-snug">
                {contact.displayName}'s encryption key has changed since you first connected. 
                This could indicate a man-in-the-middle attack or that they reinstalled the app.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => navigate(`/chat/${contactId}/safety`)}
                >
                  Verify Safety Number
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] text-muted-foreground"
                  onClick={handleAcceptKeyChange}
                >
                  Accept New Key
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-destructive/60 hover:text-destructive shrink-0"
              onClick={() => setMismatchDismissed(true)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-sm">Decrypting messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
            <Shield className="h-10 w-10 text-primary/50" />
            <p className="text-muted-foreground text-sm">No messages yet</p>
            <p className="text-muted-foreground text-xs max-w-[200px]">
              Messages are encrypted end-to-end and relayed through a blind server that can never read them.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              text={msg.text}
              fromMe={msg.fromMe}
              timestamp={msg.timestamp}
              status={msg.status}
              disappearing={state.disappearTimer !== "off"}
              hmacVerified={msg.hmacVerified}
            />
          ))
        )}
        {isContactTyping && <TypingIndicator name={contact.displayName} />}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} onSendFile={handleSendFile} onTyping={handleTyping} />
    </div>
  );
};

export default Chat;

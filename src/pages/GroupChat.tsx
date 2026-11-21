import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCrypto } from "@/hooks/useCrypto";
import { ArrowLeft, Shield, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import MessageBubble from "@/components/MessageBubble";
import ChatInput from "@/components/ChatInput";
import { getGroup } from "@/store/groups";

interface GroupMsg {
  id: string;
  text: string;
  fromMe: boolean;
  senderName: string;
  timestamp: number;
}

const GroupChat = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { state, sendGroupMessage, getDecryptedGroupMessages, deleteGroupChat, onIncomingMessage } = useCrypto();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<GroupMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const group = groupId ? getGroup(groupId) : undefined;

  useEffect(() => {
    if (!state.identity) {
      if (state.initialized) navigate("/", { replace: true });
      return;
    }
    if (!group) { navigate("/contacts"); return; }
    loadMessages();

    const unsubscribe = onIncomingMessage(() => {
      loadMessages();
    });
    return unsubscribe;
  }, [groupId, state.identity, state.initialized]);

  const loadMessages = async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const msgs = await getDecryptedGroupMessages(groupId);
      setMessages(msgs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!groupId) return;
    await sendGroupMessage(groupId, text);
    await loadMessages();
  };

  const handleDelete = () => {
    if (!groupId) return;
    deleteGroupChat(groupId);
    navigate("/contacts");
  };

  if (!state.identity || !group) return null;

  const memberCount = group.memberIds.length + 1; // +1 for self

  return (
    <div className="dark flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b bg-card/50 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate("/contacts")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{group.name}</p>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users className="h-2.5 w-2.5 text-primary" />
            <span>{memberCount} members</span>
            <span>·</span>
            <Shield className="h-2.5 w-2.5 text-primary" />
            <span>E2E Pairwise</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-sm">Decrypting messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
            <Users className="h-10 w-10 text-primary/50" />
            <p className="text-muted-foreground text-sm">No messages yet</p>
            <p className="text-muted-foreground text-xs max-w-[220px]">
              Messages are encrypted individually for each member using pairwise queues. The server never sees group metadata.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id}>
              {!msg.fromMe && (
                <p className="text-[10px] text-primary ml-1 mb-0.5">{msg.senderName}</p>
              )}
              <MessageBubble
                text={msg.text}
                fromMe={msg.fromMe}
                timestamp={msg.timestamp}
                status="sent"
              />
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} />
    </div>
  );
};

export default GroupChat;

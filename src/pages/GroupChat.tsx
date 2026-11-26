import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCrypto } from "@/hooks/useCrypto";
import { ArrowLeft, Shield, Trash2, Users, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import MessageBubble from "@/components/MessageBubble";
import ChatInput from "@/components/ChatInput";
import { getGroup } from "@/store/groups";
import GroupMembersDialog from "@/components/GroupMembersDialog";
import { useToast } from "@/hooks/use-toast";
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
import { useTier } from "@/hooks/useTier";
import PinDropDialog from "@/components/PinDropDialog";
import { wrapPinDrop } from "@/lib/location";
import VoiceRecorder from "@/components/VoiceRecorder";
import { blobToBase64, MAX_CHAT_VOICE_BYTES, wrapVoiceMessage } from "@/lib/voiceMessage";

interface GroupMsg {
  id: string;
  text: string;
  fromMe: boolean;
  senderName: string;
  timestamp: number;
}

const GroupChat = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { state, sendGroupMessage, getDecryptedGroupMessages, deleteGroupChat, onIncomingMessage, addGroupMembers } = useCrypto();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { has } = useTier();
  const [pinDropOpen, setPinDropOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
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
    if (!group) { navigate("/chats?tab=groups", { replace: true }); return; }
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
    try {
      await sendGroupMessage(groupId, text);
      await loadMessages();
    } catch (err) {
      toast({ title: "Message not sent", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const handleDelete = () => {
    if (!groupId) return;
    deleteGroupChat(groupId);
    navigate("/chats?tab=groups", { replace: true });
  };

  if (!state.identity || !group) return null;

  const memberCount = group.memberIds.length + 1; // +1 for self

  return (
    <div className="dark flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b bg-card/50 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate("/chats?tab=groups")} aria-label="Back to groups">
          <ArrowLeft className="h-5 w-5 text-primary" />
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
        {has("groupChats") && (
          <Button variant="ghost" size="icon" onClick={() => setAdding(true)} aria-label="Add members" className="text-primary hover:text-primary">
            <UserPlus className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete group" className="text-destructive hover:text-destructive">
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

      {/* Input — Free plan can read existing groups but not send */}
      {has("groupChats") ? (
        <ChatInput
          onSend={handleSend}
          onDropPin={() => (has("pinDrops") ? setPinDropOpen(true) : navigate("/upgrade"))}
          onVoice={() => (has("voiceMessages") ? setVoiceOpen(true) : navigate("/upgrade"))}
        />
      ) : (
        <div className="border-t bg-card/50 p-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Group chats need the Standard or Premium plan.</p>
          <Button size="sm" onClick={() => navigate("/upgrade")}>See plans</Button>
        </div>
      )}
      <VoiceRecorder
        open={voiceOpen}
        allowFilter={has("voiceFilter")}
        maxBytes={MAX_CHAT_VOICE_BYTES}
        onClose={() => setVoiceOpen(false)}
        onSend={async (blob, durationMs) => {
          await handleSend(wrapVoiceMessage({ mime: blob.type, data: await blobToBase64(blob), durationMs }));
        }}
      />
      <GroupMembersDialog
        open={adding}
        onOpenChange={setAdding}
        contacts={state.contacts}
        mode="add"
        excludeIds={group.memberIds}
        onConfirm={(ids) => {
          addGroupMembers(group.id, ids);
          toast({ title: `Added ${ids.length} ${ids.length === 1 ? "person" : "people"}`, description: "Invite to the group." });
        }}
      />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="dark">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {group.name}?</AlertDialogTitle>
            <AlertDialogDescription>The group and its messages are deleted from this phone. Other members keep their copy.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PinDropDialog open={pinDropOpen} onClose={() => setPinDropOpen(false)} onSend={(pin) => void handleSend(wrapPinDrop(pin))} />
    </div>
  );
};

export default GroupChat;

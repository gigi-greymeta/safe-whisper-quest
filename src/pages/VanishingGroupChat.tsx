import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Crown, ImagePlus, Loader2, Mic, Send, Timer, Trash2, UserMinus, UserPlus, Users } from "lucide-react";
import VoiceRecorder from "@/components/VoiceRecorder";
import { useTier } from "@/hooks/useTier";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useCrypto } from "@/hooks/useCrypto";
import { useToast } from "@/hooks/use-toast";
import { useVanishingGroups } from "@/contexts/VanishingGroupsContext";
import { fetchMessages } from "@/lib/vanishing/api";
import { MAX_MEDIA_BYTES, openMedia, openMessage, postMedia, postToGroup, type VanishingBody, type VanishingMessage } from "@/lib/vanishing/messages";
import type { VanishingGroup } from "@/store/vanishingGroups";

const POLL_MS = 3000;

const timeLeft = (expiresAt: number, now: number) => {
  const mins = Math.max(0, Math.round((expiresAt - now) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h left` : `${mins}m left`;
};

/** A photo or video: downloaded and decrypted on tap, held only in memory. */
const MediaView = ({ group, body }: { group: VanishingGroup; body: Extract<VanishingBody, { kind: "media" }> }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const isVideo = body.mime.startsWith("video/");
  const isAudio = body.mime.startsWith("audio/");

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const load = async () => {
    setState("loading");
    try {
      setUrl(await openMedia(group, body));
      setState("idle");
    } catch {
      setState("error");
    }
  };

  if (url) {
    if (isAudio) return <audio src={url} controls autoPlay className="w-60 max-w-full" />;
    return isVideo ? (
      <video src={url} controls playsInline className="rounded-lg max-w-full max-h-72" />
    ) : (
      <img src={url} alt="" className="rounded-lg max-w-full max-h-72 object-contain" />
    );
  }
  return (
    <button type="button" onClick={() => void load()} className="flex items-center gap-2 rounded-lg border border-current/20 px-3 py-2 text-xs">
      {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      {state === "error" ? "Couldn't open (it may have expired)" : isAudio ? "Tap to play voice message" : `Tap to view ${isVideo ? "video" : "photo"} · ${Math.round(body.size / 1024)} KB`}
    </button>
  );
};

const VanishingGroupChat = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { state } = useCrypto();
  const { groups, myFingerprint, invite, removeMember, deleteGroup, leaveGroup } = useVanishingGroups();
  const group = groups.find((g) => g.id === groupId);
  const isAdmin = !!group?.adminToken;

  const [messages, setMessages] = useState<VanishingMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState<number | null>(null); // upload progress, or 0 for text
  const [now, setNow] = useState(Date.now());
  const [membersOpen, setMembersOpen] = useState(false);
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<"delete" | "leave" | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const { has } = useTier();
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSeen = useRef<string | undefined>(undefined);
  const queueRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!group) navigate("/vanishing", { replace: true });
  }, [group, navigate]);

  const poll = useCallback(async () => {
    if (!group) return;
    // A new address (after a member was removed) starts the history fresh.
    if (queueRef.current !== group.queueId) {
      queueRef.current = group.queueId;
      lastSeen.current = undefined;
      setMessages([]);
    }
    try {
      const rows = await fetchMessages(group.queueId, lastSeen.current);
      if (rows.length === 0) return;
      lastSeen.current = rows[rows.length - 1].created_at;
      const opened = (await Promise.all(rows.map((r) => openMessage(group, r)))).filter((m): m is VanishingMessage => !!m);
      setMessages((prev) => [...prev, ...opened.filter((m) => !prev.some((p) => p.id === m.id))]);
    } catch (e) {
      console.error("[vanishing] fetch failed", e);
    }
  }, [group]);

  useEffect(() => {
    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  // Drop messages the moment they expire, and keep the countdowns fresh.
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setMessages((prev) => (prev.some((m) => m.expiresAt <= n) ? prev.filter((m) => m.expiresAt > n) : prev));
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  if (!group || !myFingerprint) return null;

  const sendText = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(0);
    try {
      await postToGroup(group, myFingerprint, { kind: "text", text: trimmed });
      setText("");
      await poll();
    } catch (e) {
      toast({ title: "Not sent", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  const sendFile = async (file: File) => {
    if (file.size > MAX_MEDIA_BYTES) {
      toast({ title: "File too large", description: "Photos and videos can be up to 20 MB.", variant: "destructive" });
      return;
    }
    setSending(0);
    try {
      await postMedia(group, myFingerprint, file, setSending);
      await poll();
    } catch (e) {
      toast({ title: "Not sent", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  const invitable = state.contacts.filter(
    (c) => !group.members.some((m) => m.fingerprint === c.publicKeyFingerprint) && !(group.invited ?? []).includes(c.publicKeyFingerprint)
  );

  return (
    <div className="dark flex flex-col h-screen bg-background">
      <div className="flex items-center gap-3 p-3 border-b bg-card/50 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" onClick={() => navigate("/vanishing")} aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-primary" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{group.name}</p>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Timer className="h-3 w-3" /> Wiped from the server after 48 hours · {group.members.length} members
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Members" onClick={() => setMembersOpen(true)}>
          <Users className="h-5 w-5 text-primary" />
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground mt-16 px-8">
            Nothing here.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.from === myFingerprint;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5", mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border rounded-bl-md text-card-foreground")}>
                {!mine && <p className="text-[10px] text-primary mb-0.5">{m.fromName}</p>}
                {m.body.kind === "text" ? (
                  <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{m.body.text}</p>
                ) : (
                  <MediaView group={group} body={m.body} />
                )}
                <p className={cn("text-[10px] mt-1", mine ? "text-primary-foreground/60 text-right" : "text-muted-foreground")}>
                  {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {timeLeft(m.expiresAt, now)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t bg-card/50 p-3 flex items-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void sendFile(f);
          }}
        />
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Send photo or video" disabled={sending !== null} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label="Voice message"
          disabled={sending !== null}
          onClick={() => (has("voiceMessages") ? setVoiceOpen(true) : navigate("/upgrade"))}
        >
          <Mic className="h-4 w-4" />
        </Button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendText();
            }
          }}
          placeholder={sending !== null && sending > 0 ? `Encrypting and uploading… ${Math.round(sending * 100)}%` : "Vanishing message…"}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground min-h-[40px] max-h-[120px] focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button size="icon" className="rounded-full h-10 w-10 shrink-0" aria-label="Send" disabled={sending !== null || !text.trim()} onClick={() => void sendText()}>
          {sending !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      <VoiceRecorder
        open={voiceOpen}
        allowFilter={has("voiceFilter")}
        maxBytes={MAX_MEDIA_BYTES}
        onClose={() => setVoiceOpen(false)}
        onSend={async (blob) => {
          const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
          await postMedia(group, myFingerprint, new File([blob], `voice.${ext}`, { type: blob.type }));
          await poll();
        }}
      />

      <Sheet open={membersOpen} onOpenChange={setMembersOpen}>
        <SheetContent side="bottom" className="dark max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Members</SheetTitle>
          </SheetHeader>
          <ul className="mt-3 space-y-1">
            {group.members.map((m) => (
              <li key={m.fingerprint} className="flex items-center gap-2 rounded p-2">
                <span className="flex-1 text-sm text-foreground truncate">
                  {m.name || "Member"}
                  {m.fingerprint === myFingerprint && " (you)"}
                </span>
                {m.fingerprint === group.adminFingerprint ? (
                  <span className="text-[10px] text-amber-400 flex items-center gap-1"><Crown className="h-3 w-3" /> Admin</span>
                ) : (
                  isAdmin && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void removeMember(group.id, m.fingerprint)}>
                      <UserMinus className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  )
                )}
              </li>
            ))}
            {(group.invited ?? []).length > 0 && isAdmin && (
              <li className="text-xs text-muted-foreground p-2">{group.invited!.length} invited, not joined yet</li>
            )}
          </ul>

          {isAdmin && invitable.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-foreground">Invite</p>
              {invitable.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded p-2 hover:bg-muted/40">
                  <Checkbox checked={inviteIds.includes(c.id)} onCheckedChange={(on) => setInviteIds((s) => (on ? [...s, c.id] : s.filter((id) => id !== c.id)))} />
                  <span className="text-sm text-foreground">{c.displayName}</span>
                </label>
              ))}
              <Button
                size="sm"
                disabled={inviteIds.length === 0}
                onClick={() => {
                  void invite(group.id, inviteIds);
                  setInviteIds([]);
                  toast({ title: "Invites sent" });
                }}
              >
                <UserPlus className="h-4 w-4 mr-1" /> Send invites
              </Button>
            </div>
          )}

          <Button variant="outline" className="w-full mt-4 border-destructive/50 text-destructive" onClick={() => setConfirm(isAdmin ? "delete" : "leave")}>
            <Trash2 className="h-4 w-4 mr-2" /> {isAdmin ? "Delete group for everyone" : "Leave group"}
          </Button>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="dark">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? "Delete this group?" : "Leave this group?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "Every message, photo and video is wiped from the server now, and the group disappears for all members."
                : "You'll stop seeing messages, and the admin is told you've left."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const action = confirm === "delete" ? deleteGroup(group.id) : leaveGroup(group.id);
                void action
                  .then(() => navigate("/vanishing", { replace: true }))
                  .catch((e) => toast({ title: "Couldn't finish", description: e instanceof Error ? e.message : undefined, variant: "destructive" }));
              }}
            >
              {confirm === "delete" ? "Delete" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VanishingGroupChat;

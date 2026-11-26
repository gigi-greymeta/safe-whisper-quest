import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MessageSquarePlus, NotebookPen, Timer, User, UserX, Users, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppTabBar from "@/components/AppTabBar";
import GroupMembersDialog from "@/components/GroupMembersDialog";
import RelayStatusIndicator from "@/components/RelayStatusIndicator";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import EphemeralSessionWarning from "@/components/EphemeralSessionWarning";
import FirstRunIntro, { hasSeenFirstRun } from "@/components/FirstRunIntro";
import { useEphemeralSession } from "@/hooks/useEphemeralSession";
import { useCrypto } from "@/hooks/useCrypto";
import { useTier, SHOW_TEST_NOTICE } from "@/hooks/useTier";
import { useToast } from "@/hooks/use-toast";
import { useVanishingGroups } from "@/contexts/VanishingGroupsContext";
import { useRequests } from "@/contexts/RequestsContext";
import MessageRequests from "@/components/MessageRequests";
import { getMessagesForContact } from "@/store/messages";
import { getGroupMessages } from "@/store/groupMessages";
import { handleLogoSecretTap } from "@/lib/secretTap";
import { cn } from "@/lib/utils";

/** "14:05" today, "Mon" this week, otherwise "3 Nov". */
function when(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (now.getTime() - timestamp < 6 * 86_400_000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

/**
 * Main screen: conversations, newest first. Direct chats and groups are on separate tabs.
 * Message text isn't previewed here: it stays encrypted on the phone until a chat is opened.
 */
const Chats = () => {
  const { state, onIncomingMessage, createGroupChat, retryFailedOutbox, checkContactAccounts } = useCrypto();
  const { groups: vanishingGroups, invites } = useVanishingGroups();
  const { requests } = useRequests();
  const { has } = useTier();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "groups" ? "groups" : "direct";
  const [refresh, setRefresh] = useState(0);
  const [creating, setCreating] = useState(false);
  const [showIntro, setShowIntro] = useState(() => !hasSeenFirstRun());
  const ephemeral = useEphemeralSession();

  useEffect(() => {
    if (state.initialized && !state.identity) navigate("/", { replace: true });
  }, [navigate, state.identity, state.initialized]);

  // New messages reorder the list.
  useEffect(() => onIncomingMessage(() => setRefresh((n) => n + 1)), [onIncomingMessage]);
  useEffect(() => {
    void checkContactAccounts();
    const onVisible = () => document.visibilityState === "visible" && setRefresh((n) => n + 1);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [checkContactAccounts]);

  const direct = useMemo(() => {
    void refresh;
    return state.contacts
      .map((contact) => {
        const messages = getMessagesForContact(contact.id);
        const last = messages.reduce((max, m) => Math.max(max, m.timestamp), 0);
        const unread = messages.filter((m) => !m.fromMe && m.status !== "read").length;
        return { contact, last, unread };
      })
      .filter((row) => row.last > 0)
      .sort((a, b) => b.last - a.last);
  }, [state.contacts, refresh]);

  const groups = useMemo(() => {
    void refresh;
    return state.groups
      .map((group) => ({ group, last: getGroupMessages(group.id).reduce((max, m) => Math.max(max, m.timestamp), group.createdAt) }))
      .sort((a, b) => b.last - a.last);
  }, [state.groups, refresh]);

  const setTab = useCallback((value: string) => setParams(value === "groups" ? { tab: "groups" } : {}, { replace: true }), [setParams]);

  if (!state.identity) return null;

  return (
    <div className="dark flex flex-col h-screen bg-background">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card/50 backdrop-blur-sm">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-foreground" onClick={handleLogoSecretTap}>Chats</h1>
          <RelayStatusIndicator
            status={state.relayStatus}
            pendingCount={state.outboxPending}
            failedCount={state.outboxFailed}
            onRetry={retryFailedOutbox}
            compact
            className="border-0 bg-transparent px-0 py-0"
          />
        </div>
        <Button size="icon" variant="ghost" onClick={() => navigate("/notes")} aria-label="Notes" className="text-primary hover:text-primary">
          <NotebookPen className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={() => (tab === "groups" ? (has("groupChats") ? setCreating(true) : navigate("/upgrade")) : navigate("/contacts"))}
          aria-label={tab === "groups" ? "New group" : "New chat"}
          className="text-primary hover:text-primary"
        >
          {tab === "groups" ? <Plus className="h-4 w-4" /> : <MessageSquarePlus className="h-4 w-4" />}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0 flex flex-col">
        <TabsList className="grid grid-cols-2 mx-3 mt-3">
          <TabsTrigger value="direct">
            Direct{requests.length > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{requests.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="groups">
            Groups{invites.length > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{invites.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="direct" className="flex-1 min-h-0 overflow-y-auto p-2 mt-1">
          <MessageRequests />
          {SHOW_TEST_NOTICE && <p className="text-[11px] text-center text-amber-300 pb-1">Test build · all features unlocked</p>}
          {direct.length === 0 ? (
            <div className="flex flex-col items-center text-center p-8 space-y-3">
              <MessageSquarePlus className="h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">No chats yet</p>
              <p className="text-xs text-muted-foreground max-w-[220px]">Open Contacts and pick someone to start an encrypted chat.</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/contacts")}>Open Contacts</Button>
            </div>
          ) : (
            <div className="space-y-1">
              {direct.map(({ contact, last, unread }) => (
                <button
                  key={contact.id}
                  onClick={() => navigate(`/chat/${contact.id}`)}
                  className="flex items-center gap-3 w-full rounded-xl p-3 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className={cn("h-12 w-12 shrink-0 rounded-full flex items-center justify-center", contact.accountDeleted ? "bg-muted" : "bg-primary/10")}>
                    {contact.accountDeleted ? <UserX className="h-5 w-5 text-muted-foreground" /> : <User className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm truncate", unread ? "font-semibold text-foreground" : "font-medium text-foreground")}>{contact.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {contact.accountDeleted ? "Account deleted" : unread ? `${unread} new message${unread === 1 ? "" : "s"}` : "End-to-end encrypted"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={cn("text-[11px]", unread ? "text-primary" : "text-muted-foreground")}>{when(last)}</span>
                    {unread > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{unread}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="pt-4 px-2">{ephemeral ? <EphemeralSessionWarning /> : <InstallAppPrompt />}</div>
        </TabsContent>

        <TabsContent value="groups" className="flex-1 min-h-0 overflow-y-auto p-2 mt-1 space-y-3">
          <div className="space-y-1">
            {groups.map(({ group, last }) => (
              <button
                key={group.id}
                onClick={() => navigate(`/group/${group.id}`)}
                className="flex items-center gap-3 w-full rounded-xl p-3 hover:bg-accent/50 transition-colors text-left"
              >
                <div className="h-12 w-12 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{group.name}</p>
                  <p className="text-xs text-muted-foreground">{group.memberIds.length + 1} members · E2E</p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">{when(last)}</span>
              </button>
            ))}
            {groups.length === 0 && (
              <div className="flex flex-col items-center text-center p-6 space-y-3">
                <Users className="h-10 w-10 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">No groups yet</p>
                <Button variant="outline" size="sm" onClick={() => (has("groupChats") ? setCreating(true) : navigate("/upgrade"))}>
                  <Plus className="h-4 w-4 mr-1" /> New group
                </Button>
              </div>
            )}
          </div>

          <button
            onClick={() => navigate("/vanishing")}
            className="flex items-center gap-3 w-full rounded-xl border p-3 hover:bg-accent/50 transition-colors text-left"
          >
            <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
              <Timer className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-foreground">Vanishing groups</p>
              <p className="text-xs text-muted-foreground">
                {vanishingGroups.length} group{vanishingGroups.length === 1 ? "" : "s"} · wiped from the server after 48 hours
                {invites.length > 0 && ` · ${invites.length} invite${invites.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </TabsContent>
      </Tabs>

      <AppTabBar />

      <GroupMembersDialog
        open={creating}
        onOpenChange={setCreating}
        contacts={state.contacts}
        mode="create"
        onConfirm={(memberIds, name) => {
          const group = createGroupChat(name, memberIds);
          toast({ title: "Group created", description: `${group.name} with ${memberIds.length + 1} people.` });
          navigate(`/group/${group.id}`);
        }}
      />

      {showIntro && <FirstRunIntro onDone={() => setShowIntro(false)} />}
    </div>
  );
};

export default Chats;

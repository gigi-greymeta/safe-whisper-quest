// Group message storage — messages stored encrypted in localStorage keyed by groupId

const GROUP_MESSAGES_KEY = "phantom_group_messages";

export interface GroupMessage {
  id: string;
  groupId: string;
  senderContactId: string | null; // null = from me
  senderName: string;
  ciphertext: string;
  iv: string;
  timestamp: number;
}

export function getAllGroupMessages(): GroupMessage[] {
  const stored = localStorage.getItem(GROUP_MESSAGES_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as GroupMessage[];
  } catch {
    return [];
  }
}

export function getGroupMessages(groupId: string): GroupMessage[] {
  return getAllGroupMessages().filter((m) => m.groupId === groupId);
}

export function saveGroupMessage(msg: Omit<GroupMessage, "id">): GroupMessage {
  const messages = getAllGroupMessages();
  const full: GroupMessage = { ...msg, id: crypto.randomUUID() };
  messages.push(full);
  localStorage.setItem(GROUP_MESSAGES_KEY, JSON.stringify(messages));
  return full;
}

export function deleteGroupMessages(groupId: string): void {
  const messages = getAllGroupMessages().filter((m) => m.groupId !== groupId);
  localStorage.setItem(GROUP_MESSAGES_KEY, JSON.stringify(messages));
}

export function clearAllGroupMessages(): void {
  localStorage.removeItem(GROUP_MESSAGES_KEY);
}

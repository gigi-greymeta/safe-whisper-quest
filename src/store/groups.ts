// Group chat management — groups stored locally, messages fan out via pairwise queues

const GROUPS_KEY = "phantom_groups";

export interface Group {
  id: string;
  name: string;
  /** Contact IDs of members (not including self) */
  memberIds: string[];
  createdAt: number;
  createdBy: string; // fingerprint of creator
}

export function getGroups(): Group[] {
  const stored = localStorage.getItem(GROUPS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as Group[];
  } catch {
    return [];
  }
}

export function getGroup(id: string): Group | undefined {
  return getGroups().find((g) => g.id === id);
}

export function createGroup(name: string, memberIds: string[], createdBy: string): Group {
  const groups = getGroups();
  const group: Group = {
    id: crypto.randomUUID(),
    name,
    memberIds,
    createdAt: Date.now(),
    createdBy,
  };
  groups.push(group);
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  return group;
}

export function updateGroup(id: string, updates: Partial<Group>): void {
  const groups = getGroups();
  const idx = groups.findIndex((g) => g.id === id);
  if (idx !== -1) {
    groups[idx] = { ...groups[idx], ...updates };
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  }
}

export function deleteGroup(id: string): void {
  const groups = getGroups().filter((g) => g.id !== id);
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

export function clearGroups(): void {
  localStorage.removeItem(GROUPS_KEY);
}

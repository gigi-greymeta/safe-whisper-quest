// Secure notepad (Premium).
//
// Real notes: encrypted with a key derived from the identity's private key, and
// the encrypted blob also sits in the PIN vault (SENSITIVE_KEYS in vault.ts), so
// it's sealed twice at rest and gone after a panic wipe.
//
// Decoy notes: harmless notes shown first when the decoy list is on. They're kept
// in plain storage on purpose, so the decoy list (and the Notes disguise) can show
// them even while the app is locked.

import { getIdentity } from "@/store/identity";

const SECURE_NOTES_KEY = "phantom_secure_notes";
const DECOY_NOTES_KEY = "phantom_decoy_notes";
const SETTINGS_KEY = "phantom_notepad_settings";

export interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

export interface NotepadSettings {
  /** How the real notes are unlocked. */
  unlock: "any" | "pin" | "biometrics";
  /** Which PIN opens them: the app PIN, or a separate notepad PIN. */
  pinSource: "app" | "notepad";
  /** Show a harmless notes list first; adding a note titled with the PIN reveals the real ones. */
  decoy: boolean;
}

// Decoy list on by default: for Premium, Notes opens straight to everyday notes, no PIN.
const DEFAULT_SETTINGS: NotepadSettings = { unlock: "any", pinSource: "app", decoy: true };

export function getNotepadSettings(): NotepadSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveNotepadSettings(settings: NotepadSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ─── Real notes ──────────────────────────────────────────────────────

async function notesKey(): Promise<CryptoKey> {
  const identity = getIdentity();
  const d = identity?.keyPair.privateKey.d;
  if (!d) throw new Error("No identity");
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`phantom-notes-v1:${d}`));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function loadSecureNotes(): Promise<Note[]> {
  const raw = localStorage.getItem(SECURE_NOTES_KEY);
  if (!raw) return [];
  const { iv, data } = JSON.parse(raw) as { iv: string; data: string };
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await notesKey(), fromB64(data));
  return JSON.parse(new TextDecoder().decode(plain)) as Note[];
}

export async function saveSecureNotes(notes: Note[]): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await notesKey(), new TextEncoder().encode(JSON.stringify(notes)));
  localStorage.setItem(SECURE_NOTES_KEY, JSON.stringify({ iv: toB64(iv), data: toB64(new Uint8Array(sealed)) }));
}

export function hasSecureNotes(): boolean {
  return !!localStorage.getItem(SECURE_NOTES_KEY);
}

// ─── Decoy notes ─────────────────────────────────────────────────────

const day = 24 * 60 * 60 * 1000;

/** Everyday notes the decoy list is drawn from. */
const DECOY_POOL: { title: string; body: string }[] = [
  { title: "Groceries", body: "Milk\nBread\nEggs\nBananas\nCoffee\nRice\nOlive oil" },
  { title: "Gift ideas", body: "Mum: scarf or a cookbook\nSam: headphones\nJess: candle set" },
  { title: "Gym", body: "Mon: legs\nWed: back + arms\nFri: chest\n30 min cardio after" },
  { title: "Books to read", body: "The Overstory\nTomorrow, and Tomorrow, and Tomorrow\nProject Hail Mary" },
  { title: "Packing list", body: "Chargers\nSunscreen\nPassport\nSwimmers\nToothbrush\nSnacks for the plane" },
  { title: "Movies", body: "Dune Part Two\nPast Lives\nThe Holdovers\nAsk Tom about that documentary" },
  { title: "Car", body: "Service due at 60,000 km\nRego renews in March\nTyres rotated last time" },
  { title: "Pasta bake", body: "500g penne\n1 jar passata\nOnion, garlic\nSpinach\nMozzarella on top, 25 min at 200°" },
  { title: "Weekend", body: "Laundry\nCall the plumber\nMarket Saturday morning\nReturn library books" },
  { title: "Budget", body: "Rent\nPower bill due on the 15th\nPhone plan\nPut $100 into savings" },
  { title: "Garden", body: "Water tomatoes every second day\nBuy potting mix\nPrune the lemon tree" },
  { title: "Birthdays", body: "Dad: 14 June\nNina: 2 August\nLeo: 19 October" },
  { title: "Meeting notes", body: "Q3 plan\nFollow up with Priya on numbers\nNext catch-up Thursday" },
  { title: "Recipes to try", body: "Shakshuka\nThai green curry\nBanana bread (the one with walnuts)" },
  { title: "Podcasts", body: "Ask Chris for the history one\nThe science one about sleep" },
  { title: "Hardware store", body: "Picture hooks\nAA batteries\nLight globe for the hallway\nWD-40" },
  { title: "Holiday ideas", body: "Tasmania in autumn?\nLook at flights in February\nCheck leave balance" },
  { title: "Dentist", body: "Check-up booked\nAsk about the sensitive tooth" },
  { title: "Things to fix", body: "Squeaky door in the bedroom\nBathroom fan\nLoose shelf in the pantry" },
  { title: "Playlist", body: "Fleetwood Mac – Dreams\nKhruangbin\nThat song from the café" },
  { title: "Moving checklist", body: "Update address with the bank\nInternet transfer\nBook a van" },
  { title: "Dinner party", body: "6 people\nRoast veggies\nLemon tart\nAsk Ben to bring wine" },
  { title: "Running", body: "5 km in 29:40\nTry the river loop next\nNew shoes soon" },
  { title: "Wi-Fi at Mum's", body: "Network is the one ending in 5G\nPassword on the fridge" },
];

/** A random handful of decoys with believable, spread-out dates. */
export function randomDecoyNotes(now = Date.now()): Note[] {
  const pool = [...DECOY_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const count = 4 + (crypto.getRandomValues(new Uint32Array(1))[0] % 4); // 4 to 7
  return pool.slice(0, count).map((n) => ({
    id: crypto.randomUUID(),
    ...n,
    updatedAt: now - (1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 60)) * day - (crypto.getRandomValues(new Uint32Array(1))[0] % day),
  }));
}

/** Replace the decoy list with a new random set. */
export function shuffleDecoyNotes(): Note[] {
  const fresh = randomDecoyNotes();
  saveDecoyNotes(fresh);
  return fresh;
}

export function loadDecoyNotes(): Note[] {
  try {
    const raw = localStorage.getItem(DECOY_NOTES_KEY);
    if (raw) return JSON.parse(raw) as Note[];
  } catch {
    // Corrupt or blocked storage: fall through to fresh starter notes.
  }
  // Picked at random once, then kept, so the list looks the same each time it's opened.
  return shuffleDecoyNotes();
}

export function saveDecoyNotes(notes: Note[]): void {
  try {
    localStorage.setItem(DECOY_NOTES_KEY, JSON.stringify(notes));
  } catch {
    // Storage blocked: decoys still work for this session.
  }
}

export function newNote(): Note {
  return { id: crypto.randomUUID(), title: "", body: "", updatedAt: Date.now() };
}

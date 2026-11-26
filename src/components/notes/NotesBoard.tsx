import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newNote, type Note } from "@/store/notes";

interface NotesBoardProps {
  notes: Note[];
  onChange: (notes: Note[]) => void;
  /** Heading; plain "Notes" for the decoy so it looks like any notes app. */
  title: string;
  /** Long-pressing the heading (decoy list's hidden way in). */
  onTitleLongPress?: () => void;
  onBack?: () => void;
  /** Extra header buttons (lock, settings). */
  actions?: ReactNode;
  canCreate?: boolean;
  onCreateBlocked?: () => void;
  /**
   * Decoy list's hidden way in: called with a brand-new note's title before it's saved.
   * Return true to swallow the note (it's never saved), e.g. when the title is the PIN.
   */
  onNewNoteTitle?: (title: string) => Promise<boolean>;
  emptyText?: string;
}

const LONG_PRESS_MS = 1500;

const preview = (n: Note) => n.body.split("\n").find((l) => l.trim()) ?? "No additional text";
const when = (t: number) => {
  const d = new Date(t);
  return Date.now() - t < 24 * 60 * 60 * 1000
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
};

/** A plain notes list with an editor, used for both the decoy and the real notes. */
const NotesBoard = ({ notes, onChange, title, onTitleLongPress, onBack, actions, canCreate = true, onCreateBlocked, onNewNoteTitle, emptyText }: NotesBoardProps) => {
  const [editing, setEditing] = useState<Note | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = () => {
    if (!onTitleLongPress) return;
    pressTimer.current = setTimeout(onTitleLongPress, LONG_PRESS_MS);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const finish = async (note: Note) => {
    const isNew = !notes.some((n) => n.id === note.id);
    if (isNew && onNewNoteTitle && note.title.trim()) {
      // Clear the editor first so a PIN never stays on screen while it's checked.
      setEditing(null);
      if (await onNewNoteTitle(note.title.trim())) return;
      save(note);
      return;
    }
    save(note);
    setEditing(null);
  };

  const save = (note: Note) => {
    const blank = !note.title.trim() && !note.body.trim();
    const others = notes.filter((n) => n.id !== note.id);
    onChange(blank ? others : [{ ...note, updatedAt: Date.now() }, ...others]);
  };

  if (editing) {
    return (
      <div className="dark flex flex-col h-screen bg-background">
        <div className="flex items-center gap-2 p-3 border-b">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Done"
            onClick={() => void finish(editing)}
          >
            <ArrowLeft className="h-5 w-5 text-primary" />
          </Button>
          <Input
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder="Title"
            className="flex-1 border-0 bg-transparent text-lg font-semibold text-foreground focus-visible:ring-0"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete note"
            className="text-destructive"
            onClick={() => {
              onChange(notes.filter((n) => n.id !== editing.id));
              setEditing(null);
            }}
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
        <textarea
          value={editing.body}
          onChange={(e) => setEditing({ ...editing, body: e.target.value })}
          placeholder="Start writing…"
          autoFocus={!editing.body}
          className="flex-1 resize-none bg-background p-4 text-sm leading-6 text-foreground focus:outline-none"
        />
      </div>
    );
  }

  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="dark flex flex-col h-screen bg-background">
      <div className="flex items-center gap-2 p-3 border-b">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5 text-primary" />
          </Button>
        )}
        <h1
          className="flex-1 text-xl font-semibold text-foreground select-none px-1"
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onContextMenu={(e) => onTitleLongPress && e.preventDefault()}
        >
          {title}
        </h1>
        {actions}
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center mt-16 px-6">{emptyText ?? "No notes"}</p>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((n) => (
              <li key={n.id}>
                <button type="button" className="w-full text-left px-4 py-3 hover:bg-muted/40" onClick={() => setEditing(n)}>
                  <p className="text-sm font-medium text-foreground truncate">{n.title || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    <span className="mr-2">{when(n.updatedAt)}</span>
                    {preview(n)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 flex justify-end">
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg"
          aria-label="New note"
          onClick={() => (canCreate ? setEditing(newNote()) : onCreateBlocked?.())}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
};

export default NotesBoard;

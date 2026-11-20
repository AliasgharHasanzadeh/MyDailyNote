import {
  Archive,
  CheckSquare,
  ExternalLink,
  Folder as FolderIcon,
  Link2,
  Pin,
  Plus,
  Star,
  Tag,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CalendarLocale, Folder, Goal, Note, Task } from '../types/workspace';
import { formatShortDate } from '../utils/date';
import { countWords, extractTaskStats } from '../utils/tiptap';

interface RightPanelProps {
  note: Note;
  allNotes: Note[];
  folders: Folder[];
  tasks: Task[];
  goals: Goal[];
  calendarLocale: CalendarLocale;
  onUpdateNote: (note: Note) => void;
  onSelectNote: (noteId: string) => void;
  onToggleTask: (taskId: string) => void;
  onCreateLinkedTask: (title: string, noteId: string) => void;
  onClose: () => void;
}

export function RightPanel({
  note,
  allNotes,
  folders,
  tasks,
  goals,
  calendarLocale,
  onUpdateNote,
  onSelectNote,
  onToggleTask,
  onCreateLinkedTask,
  onClose,
}: RightPanelProps) {
  const [newTag, setNewTag] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

  const checklistStats = useMemo(() => extractTaskStats(note.content), [note.content]);
  const wordCount = useMemo(() => countWords(note.plainText), [note.plainText]);

  const linkedTasks = useMemo(
    () => tasks.filter((t) => t.linkedNoteId === note.id),
    [tasks, note.id]
  );

  const linkedGoals = useMemo(
    () => goals.filter((g) => g.linkedNoteIds.includes(note.id)),
    [goals, note.id]
  );

  const relatedNotes = useMemo(() => {
    const manualIds = new Set(note.linkedNoteIds);
    const manual = allNotes.filter((n) => manualIds.has(n.id) && n.id !== note.id);
    const suggested = allNotes.filter(
      (n) =>
        n.id !== note.id &&
        !n.isArchived &&
        !manualIds.has(n.id) &&
        (n.tags.some((t) => note.tags.includes(t)) ||
          (note.parentFolderId && n.parentFolderId === note.parentFolderId))
    );
    return { manual, suggested: suggested.slice(0, 4) };
  }, [allNotes, note]);

  const linkableCandidates = useMemo(
    () =>
      allNotes.filter(
        (n) => n.id !== note.id && !n.isArchived && !note.linkedNoteIds.includes(n.id)
      ),
    [allNotes, note]
  );

  const addTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newTag.trim().toLowerCase().replace(/^#/, '');
    if (!cleaned || note.tags.includes(cleaned)) {
      setNewTag('');
      return;
    }
    onUpdateNote({
      ...note,
      tags: [...note.tags, cleaned],
      updatedAt: new Date().toISOString(),
    });
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    onUpdateNote({
      ...note,
      tags: note.tags.filter((t) => t !== tag),
      updatedAt: new Date().toISOString(),
    });
  };

  const toggleLinkedNote = (targetId: string) => {
    const exists = note.linkedNoteIds.includes(targetId);
    onUpdateNote({
      ...note,
      linkedNoteIds: exists
        ? note.linkedNoteIds.filter((id) => id !== targetId)
        : [...note.linkedNoteIds, targetId],
      updatedAt: new Date().toISOString(),
    });
  };

  const totalTasks = checklistStats.total + linkedTasks.length;
  const completedTasks =
    checklistStats.completed + linkedTasks.filter((t) => t.status === 'done').length;
  const taskPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <aside className="flex h-full w-76 shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-sidebar)] overflow-y-auto">
      <div className="flex h-13 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4">
        <span className="text-xs font-semibold text-[var(--text-primary)]">Page Details</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          aria-label="Close inspector"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-5 p-4">
        {/* Dates & Word Count */}
        <section className="space-y-2 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">Created</span>
            <span className="text-[var(--text-secondary)] tabular-nums">
              {formatShortDate(note.createdAt, calendarLocale)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">Last edited</span>
            <span className="text-[var(--text-secondary)] tabular-nums">
              {formatShortDate(note.updatedAt, calendarLocale)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">Words</span>
            <span className="text-[var(--text-secondary)] tabular-nums">{wordCount}</span>
          </div>
        </section>

        {/* Folder Assignment */}
        <section className="space-y-2 border-b border-[var(--border-subtle)] pb-4">
          <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
            <FolderIcon className="h-3.5 w-3.5" />
            Folder
          </label>
          <select
            value={note.parentFolderId || ''}
            onChange={(e) =>
              onUpdateNote({
                ...note,
                parentFolderId: e.target.value || null,
                updatedAt: new Date().toISOString(),
              })
            }
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
          >
            <option value="">No folder (Root)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.icon} {f.name}
              </option>
            ))}
          </select>
        </section>

        {/* Tags */}
        <section className="space-y-2.5 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
            <Tag className="h-3.5 w-3.5" />
            Tags
          </div>
          {note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {note.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-[var(--text-muted)] hover:text-red-500 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={addTag} className="flex items-center gap-1.5">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add tag..."
              className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newTag.trim()}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
        </section>

        {/* Task Progress */}
        <section className="space-y-2.5 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
              <CheckSquare className="h-3.5 w-3.5" />
              Task Progress
            </span>
            <span className="font-mono-tabular text-[var(--text-muted)]">
              {completedTasks}/{totalTasks}
            </span>
          </div>

          {totalTasks > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
              <div
                style={{ width: `${taskPercent}%` }}
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-200"
              />
            </div>
          )}

          {linkedTasks.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {linkedTasks.map((t) => (
                <label
                  key={t.id}
                  className="flex items-start gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={t.status === 'done'}
                    onChange={() => onToggleTask(t.id)}
                    className="mt-0.5 accent-[var(--accent)] cursor-pointer"
                  />
                  <span
                    className={
                      t.status === 'done'
                        ? 'line-through text-[var(--text-muted)]'
                        : 'text-[var(--text-primary)]'
                    }
                  >
                    {t.title}
                  </span>
                </label>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTaskTitle.trim()) return;
              onCreateLinkedTask(newTaskTitle.trim(), note.id);
              setNewTaskTitle('');
            }}
            className="flex items-center gap-1.5 pt-1"
          >
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Link a new task..."
              className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newTaskTitle.trim()}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
        </section>

        {/* Related & Linked Notes */}
        <section className="space-y-2.5 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <Link2 className="h-3.5 w-3.5" />
              Related Notes
            </span>
            <button
              type="button"
              onClick={() => setLinkPickerOpen((prev) => !prev)}
              className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
            >
              {linkPickerOpen ? 'Done' : '+ Link'}
            </button>
          </div>

          {linkPickerOpen && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5">
              {linkableCandidates.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-[var(--text-muted)]">No other notes to link</p>
              ) : (
                linkableCandidates.map((cand) => (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={() => {
                      toggleLinkedNote(cand.id);
                      setLinkPickerOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <span className="truncate">{cand.icon || '📄'} {cand.title || 'Untitled'}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {relatedNotes.manual.length === 0 && relatedNotes.suggested.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No linked notes yet</p>
          ) : (
            <div className="space-y-1">
              {relatedNotes.manual.map((rn) => (
                <div
                  key={rn.id}
                  className="group flex items-center justify-between gap-1 rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
                >
                  <button
                    type="button"
                    onClick={() => onSelectNote(rn.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[var(--text-primary)] cursor-pointer"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                    <span className="truncate">{rn.icon || '📄'} {rn.title || 'Untitled'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLinkedNote(rn.id)}
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 cursor-pointer"
                    title="Unlink"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {relatedNotes.suggested.map((sn) => (
                <button
                  key={sn.id}
                  type="button"
                  onClick={() => onSelectNote(sn.id)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <span className="truncate">{sn.icon || '📄'} {sn.title || 'Untitled'}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Connected Goals */}
        {linkedGoals.length > 0 && (
          <section className="space-y-2 border-b border-[var(--border-subtle)] pb-4">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Connected Goals</span>
            <div className="space-y-1.5">
              {linkedGoals.map((g) => (
                <div
                  key={g.id}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2 text-xs text-[var(--text-primary)]"
                >
                  {g.title}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quick Settings */}
        <section className="space-y-1.5">
          <span className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
            Quick Settings
          </span>
          <button
            type="button"
            onClick={() => onUpdateNote({ ...note, isFavorite: !note.isFavorite })}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Star className="h-3.5 w-3.5" />
              Favorite
            </span>
            <span>{note.isFavorite ? 'On' : 'Off'}</span>
          </button>
          <button
            type="button"
            onClick={() => onUpdateNote({ ...note, isPinned: !note.isPinned })}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Pin className="h-3.5 w-3.5" />
              Pin to Quick Access
            </span>
            <span>{note.isPinned ? 'On' : 'Off'}</span>
          </button>
          <button
            type="button"
            onClick={() => onUpdateNote({ ...note, isArchived: !note.isArchived })}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Archive className="h-3.5 w-3.5" />
              Archived
            </span>
            <span>{note.isArchived ? 'Yes' : 'No'}</span>
          </button>
        </section>
      </div>
    </aside>
  );
}

import { Calendar, CheckSquare, FileText, Folder as FolderIcon, Plus, Search, Target, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Folder, Goal, Note, Task, WorkspaceSection } from '../types/workspace';
import { getPreviewSnippet } from '../utils/tiptap';

interface SearchCommandPaletteProps {
  open: boolean;
  notes: Note[];
  folders: Folder[];
  tasks: Task[];
  goals: Goal[];
  onClose: () => void;
  onSelectNote: (noteId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onSelectSection: (section: WorkspaceSection) => void;
  onCreateNote: () => void;
  onOpenTodayJournal: () => void;
}

export function SearchCommandPalette({
  open,
  notes,
  folders,
  tasks,
  goals,
  onClose,
  onSelectNote,
  onSelectFolder,
  onSelectSection,
  onCreateNote,
  onOpenTodayJournal,
}: SearchCommandPaletteProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchedNotes = notes
      .filter((n) => !n.isArchived && !n.deletedAt)
      .filter(
        (n) =>
          !q ||
          n.title.toLowerCase().includes(q) ||
          n.plainText.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)) ||
          (n.journalDate || '').includes(q)
      )
      .slice(0, 8);

    const matchedFolders = q
      ? folders.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 4)
      : [];

    const matchedTasks = q
      ? tasks
          .filter(
            (t) =>
              t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
          )
          .slice(0, 4)
      : [];

    const matchedGoals = q
      ? goals.filter((g) => g.title.toLowerCase().includes(q)).slice(0, 3)
      : [];

    return { matchedNotes, matchedFolders, matchedTasks, matchedGoals };
  }, [query, notes, folders, tasks, goals]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-20 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-popover)]"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-3">
          <Search className="h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Search notes, journal dates, content, tasks, folders..."
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-3">
          {!query.trim() && (
            <div>
              <div className="px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                Quick Actions
              </div>
              <button
                type="button"
                onClick={() => {
                  onCreateNote();
                  onClose();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                <Plus className="h-4 w-4 text-[var(--accent)]" />
                Create New Note
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenTodayJournal();
                  onClose();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                <Calendar className="h-4 w-4 text-[var(--accent)]" />
                Open Today&apos;s Journal
              </button>
            </div>
          )}

          {results.matchedNotes.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                Notes & Journal
              </div>
              {results.matchedNotes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    onSelectNote(n.id);
                    onClose();
                  }}
                  className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <span className="mt-0.5 text-sm leading-none">{n.icon || <FileText className="h-3.5 w-3.5" />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-[var(--text-primary)]">
                      {n.title || 'Untitled'}
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">
                      {getPreviewSnippet(n.plainText, 85)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.matchedFolders.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                Folders
              </div>
              {results.matchedFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onSelectFolder(f.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <FolderIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span>{f.icon} {f.name}</span>
                </button>
              ))}
            </div>
          )}

          {results.matchedTasks.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                Tasks
              </div>
              {results.matchedTasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onSelectSection('tasks');
                    onClose();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span className="truncate">{t.title}</span>
                </button>
              ))}
            </div>
          )}

          {results.matchedGoals.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                Goals
              </div>
              {results.matchedGoals.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    onSelectSection('goals');
                    onClose();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <Target className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span className="truncate">{g.title}</span>
                </button>
              ))}
            </div>
          )}

          {query.trim() &&
            results.matchedNotes.length === 0 &&
            results.matchedFolders.length === 0 &&
            results.matchedTasks.length === 0 &&
            results.matchedGoals.length === 0 && (
              <p className="py-8 text-center text-xs text-[var(--text-muted)]">
                No matching items found.
              </p>
            )}
        </div>
      </div>
    </div>
  );
}

import { Clock, Menu, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CalendarLocale, Folder, Note } from '../../types/workspace';
import { formatRelativeTime, getTrashRemainingInfo } from '../../utils/date';
import { getPreviewSnippet } from '../../utils/tiptap';

interface TrashViewProps {
  notes: Note[];
  folders: Folder[];
  calendarLocale: CalendarLocale;
  onOpenMobileSidebar: () => void;
  onRestoreNote: (noteId: string) => void;
  onPermanentDeleteNote: (noteId: string) => void;
  onEmptyTrash: () => void;
}

export function TrashView({
  notes,
  folders,
  calendarLocale,
  onOpenMobileSidebar,
  onRestoreNote,
  onPermanentDeleteNote,
  onEmptyTrash,
}: TrashViewProps) {
  const [query, setQuery] = useState('');
  const [previewNote, setPreviewNote] = useState<Note | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Refresh remaining-time labels every minute while Trash is open
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => {
        if (!q) return true;
        return (
          n.title.toLowerCase().includes(q) ||
          n.plainText.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => (b.deletedAt || b.updatedAt).localeCompare(a.deletedAt || a.updatedAt));
  }, [notes, query]);

  const getFolderLabel = (folderId: string | null) => {
    if (!folderId) return null;
    const f = folders.find((item) => item.id === folderId);
    return f ? `${f.icon} ${f.name}` : null;
  };

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)] overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] lg:hidden cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                Trash
              </h1>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Deleted notes stay recoverable for 30 days before permanent removal
              </p>
            </div>
          </div>

          {notes.length > 0 && (
            <button
              type="button"
              onClick={onEmptyTrash}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/35 bg-red-500/10 px-3.5 py-2 text-xs font-medium text-red-500 hover:bg-red-500/20 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Empty Trash ({notes.length})
            </button>
          )}
        </div>

        {/* Search */}
        {notes.length > 0 && (
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search deleted notes..."
              className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>
        )}

        {/* Trashed Notes List */}
        <div className="mt-6">
          {filteredNotes.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                <Trash2 className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {query ? 'No deleted notes match your search.' : 'Trash is empty'}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                When you delete a note, it moves here for 30 days so you can restore it anytime.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredNotes.map((n) => {
                const folderName = getFolderLabel(n.parentFolderId);
                const deletedIso = n.deletedAt || n.updatedAt;
                const remaining = getTrashRemainingInfo(deletedIso, calendarLocale, nowMs);
                const badgeClass =
                  remaining.urgency === 'critical'
                    ? 'border-red-500/35 bg-red-500/10 text-red-500'
                    : remaining.urgency === 'soon'
                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]';

                return (
                  <div
                    key={n.id}
                    className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 hover:border-[var(--border-strong)] transition-colors sm:flex-row sm:items-center sm:justify-between"
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewNote(n)}
                      className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base leading-none">{n.icon || '📄'}</span>
                        <h3
                          dir="auto"
                          className="truncate text-sm font-semibold text-[var(--text-primary)]"
                        >
                          {n.title || 'Untitled'}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums ${badgeClass}`}
                        >
                          <Clock className="h-3 w-3 shrink-0" />
                          {remaining.label}
                        </span>
                      </div>

                      <p
                        dir="auto"
                        className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)] line-clamp-2"
                      >
                        {getPreviewSnippet(n.plainText, 180)}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)] tabular-nums">
                        <span>Deleted {formatRelativeTime(deletedIso, calendarLocale)}</span>
                        {folderName && <span>· From {folderName}</span>}
                        {!folderName && n.parentFolderId && <span>· Original folder removed</span>}
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => onRestoreNote(n.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => onPermanentDeleteNote(n.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete forever
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Read-Only Preview Modal for Deleted Note */}
      {previewNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onClick={() => setPreviewNote(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-popover)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">{previewNote.icon || '📄'}</span>
                  <h3
                    dir="auto"
                    className="truncate font-display text-base font-semibold text-[var(--text-primary)]"
                  >
                    {previewNote.title || 'Untitled'}
                  </h3>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)] tabular-nums">
                  <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]">
                    <Clock className="h-3 w-3" />
                    {
                      getTrashRemainingInfo(
                        previewNote.deletedAt || previewNote.updatedAt,
                        calendarLocale,
                        nowMs
                      ).label
                    }
                  </span>
                  <span>
                    · Deleted{' '}
                    {formatRelativeTime(
                      previewNote.deletedAt || previewNote.updatedAt,
                      calendarLocale
                    )}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewNote(null)}
                className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {previewNote.plainText.trim() ? (
                <p
                  dir="auto"
                  className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]"
                >
                  {previewNote.plainText}
                </p>
              ) : (
                <p className="text-xs italic text-[var(--text-muted)]">This note had no body text.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-3.5">
              <button
                type="button"
                onClick={() => {
                  const id = previewNote.id;
                  setPreviewNote(null);
                  onPermanentDeleteNote(id);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3.5 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete forever
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = previewNote.id;
                  setPreviewNote(null);
                  onRestoreNote(id);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

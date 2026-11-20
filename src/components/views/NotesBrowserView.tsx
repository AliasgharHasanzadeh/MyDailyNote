import {
  Archive,
  ArchiveRestore,
  LayoutGrid,
  LayoutList,
  List,
  Menu,
  Pin,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CalendarLocale, Folder, Note, NoteViewMode } from '../../types/workspace';
import { formatRelativeTime } from '../../utils/date';
import { getPreviewSnippet } from '../../utils/tiptap';
import { useResolvedCoverUrl } from '../editor/extensions/useMediaUrl';

interface NotesBrowserViewProps {
  title: string;
  subtitle?: string;
  notes: Note[];
  folders: Folder[];
  pinnedFolders?: Folder[];
  viewMode: NoteViewMode;
  calendarLocale: CalendarLocale;
  onChangeViewMode: (mode: NoteViewMode) => void;
  onOpenMobileSidebar: () => void;
  onSelectNote: (noteId: string) => void;
  onSelectFolder?: (folderId: string) => void;
  onCreateNote: () => void;
  onUpdateNote: (note: Note) => void;
  onDeleteNote: (noteId: string) => void;
}

export function NotesBrowserView({
  title,
  subtitle,
  notes,
  folders,
  pinnedFolders = [],
  viewMode,
  calendarLocale,
  onChangeViewMode,
  onOpenMobileSidebar,
  onSelectNote,
  onSelectFolder,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: NotesBrowserViewProps) {
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => {
        if (selectedTag !== 'all' && !n.tags.includes(selectedTag)) return false;
        if (!q) return true;
        return (
          n.title.toLowerCase().includes(q) ||
          n.plainText.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, query, selectedTag]);

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
                {title}
              </h1>
              {subtitle && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5">
              <button
                type="button"
                onClick={() => onChangeViewMode('list')}
                title="List view"
                className={`flex h-7 w-7 items-center justify-center rounded-md cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onChangeViewMode('compact')}
                title="Compact view"
                className={`flex h-7 w-7 items-center justify-center rounded-md cursor-pointer ${
                  viewMode === 'compact'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onChangeViewMode('grid')}
                title="Grid view"
                className={`flex h-7 w-7 items-center justify-center rounded-md cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={onCreateNote}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              New Note
            </button>
          </div>
        </div>

        {/* Search & Tag Filter */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search note titles, content, and tags..."
              className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>

          {allTags.length > 0 && (
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="all">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Pinned Folders strip (when viewing Quick Access) */}
        {pinnedFolders.length > 0 && onSelectFolder && (
          <div className="mt-6">
            <h2 className="mb-2.5 text-xs font-medium text-[var(--text-muted)]">
              Pinned Folders
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {pinnedFolders.map((pf) => (
                <button
                  key={pf.id}
                  type="button"
                  onClick={() => onSelectFolder(pf.id)}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
                >
                  <span>{pf.icon}</span>
                  <span className="truncate">{pf.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes Collection */}
        <div className="mt-6">
          {filteredNotes.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                {query ? 'No notes match your search.' : 'No notes in this view yet.'}
              </p>
              <button
                type="button"
                onClick={onCreateNote}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Create a note
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredNotes.map((n) => {
                const folderName = getFolderLabel(n.parentFolderId);
                return (
                  <div
                    key={n.id}
                    className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-colors"
                  >
                    {n.coverImage && (
                      <GridCoverPreview coverImage={n.coverImage} onClick={() => onSelectNote(n.id)} />
                    )}
                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        <button
                          type="button"
                          onClick={() => onSelectNote(n.id)}
                          className="flex w-full items-center gap-2 text-left cursor-pointer"
                        >
                          <span className="text-base leading-none">{n.icon || '📄'}</span>
                          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {n.title || 'Untitled'}
                          </h3>
                        </button>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)] line-clamp-3">
                          {getPreviewSnippet(n.plainText, 130)}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
                        <div className="min-w-0 truncate text-[11px] text-[var(--text-muted)] tabular-nums">
                          <span>{formatRelativeTime(n.updatedAt, calendarLocale)}</span>
                          {folderName && <span> · {folderName}</span>}
                        </div>
                        <NoteRowActions note={n} onUpdateNote={onUpdateNote} onDeleteNote={onDeleteNote} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : viewMode === 'compact' ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
              {filteredNotes.map((n) => {
                const folderName = getFolderLabel(n.parentFolderId);
                return (
                  <div
                    key={n.id}
                    className="group flex h-10 items-center justify-between gap-3 px-4 hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectNote(n.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer"
                    >
                      <span className="text-sm leading-none">{n.icon || '📄'}</span>
                      <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {n.title || 'Untitled'}
                      </span>
                      {folderName && (
                        <span className="hidden sm:inline truncate text-xs text-[var(--text-muted)]">
                          · {folderName}
                        </span>
                      )}
                    </button>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-[var(--text-muted)] tabular-nums">
                        {formatRelativeTime(n.updatedAt, calendarLocale)}
                      </span>
                      <NoteRowActions note={n} onUpdateNote={onUpdateNote} onDeleteNote={onDeleteNote} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredNotes.map((n) => {
                const folderName = getFolderLabel(n.parentFolderId);
                return (
                  <div
                    key={n.id}
                    className="group flex items-start justify-between gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 hover:border-[var(--border-strong)] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectNote(n.id)}
                      className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none">{n.icon || '📄'}</span>
                        <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                          {n.title || 'Untitled'}
                        </h3>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)] line-clamp-2">
                        {getPreviewSnippet(n.plainText, 180)}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)] tabular-nums">
                        <span>Updated {formatRelativeTime(n.updatedAt, calendarLocale)}</span>
                        {folderName && <span>· {folderName}</span>}
                        {n.tags.length > 0 && (
                          <span>· {n.tags.map((t) => `#${t}`).join(' ')}</span>
                        )}
                      </div>
                    </button>
                    <NoteRowActions note={n} onUpdateNote={onUpdateNote} onDeleteNote={onDeleteNote} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NoteRowActions({
  note,
  onUpdateNote,
  onDeleteNote,
}: {
  note: Note;
  onUpdateNote: (note: Note) => void;
  onDeleteNote: (noteId: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => onUpdateNote({ ...note, isFavorite: !note.isFavorite })}
        title={note.isFavorite ? 'Unfavorite' : 'Favorite'}
        className={`rounded p-1 cursor-pointer ${
          note.isFavorite
            ? 'text-amber-400'
            : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--text-primary)]'
        }`}
      >
        <Star className={`h-3.5 w-3.5 ${note.isFavorite ? 'fill-amber-400' : ''}`} />
      </button>
      <button
        type="button"
        onClick={() => onUpdateNote({ ...note, isPinned: !note.isPinned })}
        title={note.isPinned ? 'Unpin' : 'Pin'}
        className={`rounded p-1 cursor-pointer ${
          note.isPinned
            ? 'text-[var(--accent)]'
            : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--text-primary)]'
        }`}
      >
        <Pin className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onUpdateNote({ ...note, isArchived: !note.isArchived })}
        title={note.isArchived ? 'Restore' : 'Archive'}
        className="rounded p-1 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--text-primary)] cursor-pointer"
      >
        {note.isArchived ? (
          <ArchiveRestore className="h-3.5 w-3.5" />
        ) : (
          <Archive className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => onDeleteNote(note.id)}
        title="Delete"
        className="rounded p-1 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-500 cursor-pointer"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function GridCoverPreview({
  coverImage,
  onClick,
}: {
  coverImage: string;
  onClick: () => void;
}) {
  const { resolvedUrl } = useResolvedCoverUrl(coverImage);

  return (
    <button
      type="button"
      onClick={onClick}
      className="h-28 w-full overflow-hidden border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/40 cursor-pointer"
    >
      {resolvedUrl ? (
        <img src={resolvedUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] text-[var(--text-muted)]">
          Google Drive Cover
        </div>
      )}
    </button>
  );
}

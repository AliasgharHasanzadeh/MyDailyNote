import {
  Archive,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  Copy,
  FileText,
  FolderPlus,
  Home,
  Layers,
  LogOut,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  Pin,
  Plus,
  Search,
  Settings,
  Star,
  Sun,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarLocale, Folder, Note, WorkspaceSection } from '../types/workspace';
import { QUICK_EMOJIS } from '../types/workspace';
import { formatCompactDate, isAutoJournalTitle } from '../utils/date';
import { GoogleSignInButton } from './GoogleSignInButton';

interface LeftSidebarProps {
  folders: Folder[];
  notes: Note[];
  activeSection: WorkspaceSection;
  activeNoteId: string | null;
  activeFolderId: string | null;
  theme: 'dark' | 'light';
  calendarLocale: CalendarLocale;
  sidebarWidth: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onCollapseDesktop: () => void;
  onResizeWidth: (width: number) => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onSelectSection: (section: WorkspaceSection) => void;
  onSelectFolder: (folderId: string) => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (parentFolderId: string | null) => void;
  onCreateFolder: (name: string, parentId: string | null, icon?: string) => void;
  onUpdateFolder: (folder: Folder) => void;
  onDeleteFolder: (folderId: string, strategy: 'move_to_parent' | 'delete_contents') => void;
  onExpandCollapseAllFolders: (expanded: boolean) => void;
  onMoveNote: (noteId: string, targetFolderId: string | null) => void;
  onMoveFolder: (folderId: string, targetParentId: string | null) => void;
  onUpdateNote: (note: Note) => void;
  onDuplicateNote: (note: Note) => void;
  onDeleteNote: (noteId: string) => void;
  onOpenSearch: () => void;
  user: User | null;
  driveConnected: boolean;
  authBusy: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

type ContextTarget =
  | { kind: 'folder'; folder: Folder; x: number; y: number }
  | { kind: 'note'; note: Note; x: number; y: number };

export function LeftSidebar({
  folders,
  notes,
  activeSection,
  activeNoteId,
  activeFolderId,
  theme,
  calendarLocale,
  sidebarWidth,
  mobileOpen,
  onCloseMobile,
  onCollapseDesktop,
  onResizeWidth,
  onToggleTheme,
  onOpenSettings,
  onSelectSection,
  onSelectFolder,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onExpandCollapseAllFolders,
  onMoveNote,
  onMoveFolder,
  onUpdateNote,
  onDuplicateNote,
  onDeleteNote,
  onOpenSearch,
  user,
  driveConnected,
  authBusy,
  onSignIn,
  onSignOut,
}: LeftSidebarProps) {
  const [sidebarFilter, setSidebarFilter] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextTarget | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newFolderModal, setNewFolderModal] = useState<{ parentId: string | null } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState('📁');
  const [deleteFolderModal, setDeleteFolderModal] = useState<Folder | null>(null);
  const [emojiFolderModal, setEmojiFolderModal] = useState<Folder | null>(null);
  const [moveTargetModal, setMoveTargetModal] = useState<
    { kind: 'note'; id: string } | { kind: 'folder'; id: string } | null
  >(null);
  const [dragItem, setDragItem] = useState<{ kind: 'note' | 'folder'; id: string } | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | 'root' | null>(null);
  const [liveWidth, setLiveWidth] = useState(sidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const liveWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    setLiveWidth(sidebarWidth);
    liveWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = liveWidthRef.current;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      const next = Math.min(500, Math.max(210, startWidth + (ev.clientX - startX)));
      liveWidthRef.current = next;
      setLiveWidth(next);
    };

    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      onResizeWidth(liveWidthRef.current);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const activeNotes = useMemo(() => notes.filter((n) => !n.isArchived), [notes]);
  const archivedCount = useMemo(() => notes.filter((n) => n.isArchived).length, [notes]);
  const favoritesCount = useMemo(() => activeNotes.filter((n) => n.isFavorite).length, [activeNotes]);
  const pinnedNotes = useMemo(() => activeNotes.filter((n) => n.isPinned), [activeNotes]);
  const pinnedFolders = useMemo(() => folders.filter((f) => f.isPinned), [folders]);

  const anyFolderExpanded = useMemo(() => folders.some((f) => f.isExpanded), [folders]);

  const isDescendant = (potentialDescendantId: string, ancestorId: string): boolean => {
    let curr: string | null = potentialDescendantId;
    const seen = new Set<string>();
    while (curr && !seen.has(curr)) {
      if (curr === ancestorId) return true;
      seen.add(curr);
      const found = folders.find((f) => f.id === curr);
      curr = found ? found.parentId : null;
    }
    return false;
  };

  const handleDropOnFolder = (targetFolderId: string | null) => {
    if (!dragItem) return;
    if (dragItem.kind === 'note') {
      onMoveNote(dragItem.id, targetFolderId);
    } else if (dragItem.kind === 'folder') {
      if (targetFolderId !== dragItem.id && (!targetFolderId || !isDescendant(targetFolderId, dragItem.id))) {
        onMoveFolder(dragItem.id, targetFolderId);
      }
    }
    setDragItem(null);
    setDragOverFolderId(null);
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
    setContextMenu(null);
  };

  const commitRenameFolder = (folder: Folder) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== folder.name) {
      onUpdateFolder({ ...folder, name: trimmed, updatedAt: new Date().toISOString() });
    }
    setRenamingId(null);
  };

  const commitRenameNote = (note: Note) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== note.title) {
      onUpdateNote({
        ...note,
        title: trimmed,
        isCustomJournalTitle: note.journalDate
          ? !isAutoJournalTitle(trimmed, note.journalDate, false)
          : undefined,
        updatedAt: new Date().toISOString(),
      });
    }
    setRenamingId(null);
  };

  const navItems: {
    id: WorkspaceSection;
    label: string;
    icon: typeof Home;
    count?: number;
  }[] = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'quick_access', label: 'Quick Access', icon: Pin, count: pinnedNotes.length + pinnedFolders.length },
    { id: 'all_notes', label: 'All Notes', icon: Layers, count: activeNotes.length },
    { id: 'favorites', label: 'Favorites', icon: Star, count: favoritesCount },
    { id: 'recent', label: 'Recent Notes', icon: Clock },
    { id: 'journal', label: 'Daily Journal', icon: Calendar },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'archived', label: 'Archived Notes', icon: Archive, count: archivedCount },
  ];

  const rootFolders = useMemo(
    () =>
      folders
        .filter((f) => f.parentId === null)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [folders]
  );

  const rootNotes = useMemo(() => {
    const q = sidebarFilter.trim().toLowerCase();
    return activeNotes
      .filter((n) => n.parentFolderId === null)
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.plainText.toLowerCase().includes(q))
      .sort((a, b) => a.sortOrder - b.sortOrder || b.updatedAt.localeCompare(a.updatedAt));
  }, [activeNotes, sidebarFilter]);

  const renderFolderTree = (folder: Folder, depth: number) => {
    const q = sidebarFilter.trim().toLowerCase();
    const childFolders = folders
      .filter((f) => f.parentId === folder.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const childNotes = activeNotes
      .filter((n) => n.parentFolderId === folder.id)
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.plainText.toLowerCase().includes(q))
      .sort((a, b) => a.sortOrder - b.sortOrder || b.updatedAt.localeCompare(a.updatedAt));

    const isSelected = activeSection === 'folder' && activeFolderId === folder.id;
    const isDragTarget = dragOverFolderId === folder.id;

    return (
      <div key={folder.id}>
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            setDragItem({ kind: 'folder', id: folder.id });
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragItem?.kind === 'folder' && (dragItem.id === folder.id || isDescendant(folder.id, dragItem.id))) {
              return;
            }
            setDragOverFolderId(folder.id);
          }}
          onDragLeave={() => setDragOverFolderId(null)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDropOnFolder(folder.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({
              kind: 'folder',
              folder,
              x: Math.min(window.innerWidth - 210, e.clientX),
              y: Math.min(window.innerHeight - 280, e.clientY),
            });
          }}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          className={`group flex items-center gap-1 rounded-lg pr-1.5 py-1 text-[13px] transition-colors ${
            isDragTarget
              ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]'
              : isSelected
              ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateFolder({ ...folder, isExpanded: !folder.isExpanded });
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            aria-label={folder.isExpanded ? 'Collapse folder' : 'Expand folder'}
          >
            {folder.isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>

          {renamingId === folder.id ? (
            <input
              type="text"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRenameFolder(folder)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRenameFolder(folder);
                if (e.key === 'Escape') setRenamingId(null);
              }}
              className="flex-1 rounded bg-[var(--bg-surface)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none ring-1 ring-[var(--accent)]"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                onSelectFolder(folder.id);
                onCloseMobile();
              }}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left cursor-pointer"
            >
              <span className="shrink-0 text-sm leading-none">{folder.icon}</span>
              <span className="truncate">{folder.name}</span>
            </button>
          )}

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCreateNote(folder.id);
                if (!folder.isExpanded) {
                  onUpdateFolder({ ...folder, isExpanded: true });
                }
              }}
              title="New note inside folder"
              className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <Plus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenu({
                  kind: 'folder',
                  folder,
                  x: Math.min(window.innerWidth - 210, rect.left),
                  y: Math.min(window.innerHeight - 280, rect.bottom + 4),
                });
              }}
              title="Folder actions"
              className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          </div>
        </div>

        {(folder.isExpanded || q.length > 0) && (
          <div>
            {childFolders.map((cf) => renderFolderTree(cf, depth + 1))}
            {childNotes.map((cn) => renderNoteRow(cn, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderNoteRow = (note: Note, depth: number) => {
    const isSelected = activeSection === 'editor' && activeNoteId === note.id;

    return (
      <div
        key={note.id}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          setDragItem({ kind: 'note', id: note.id });
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({
            kind: 'note',
            note,
            x: Math.min(window.innerWidth - 210, e.clientX),
            y: Math.min(window.innerHeight - 260, e.clientY),
          });
        }}
        style={{ paddingLeft: `${22 + depth * 14}px` }}
        className={`group flex items-center gap-1.5 rounded-lg pr-1.5 py-1 text-[13px] transition-colors ${
          isSelected
            ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        }`}
      >
        {renamingId === note.id ? (
          <input
            type="text"
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => commitRenameNote(note)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRenameNote(note);
              if (e.key === 'Escape') setRenamingId(null);
            }}
            className="flex-1 rounded bg-[var(--bg-surface)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none ring-1 ring-[var(--accent)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              onSelectNote(note.id);
              onCloseMobile();
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left cursor-pointer"
          >
            {note.icon ? (
              <span className="shrink-0 text-xs leading-none">{note.icon}</span>
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            )}
            <span className="truncate">{note.title || 'Untitled'}</span>
          </button>
        )}

        <span className="shrink-0 text-[11px] text-[var(--text-muted)] tabular-nums group-hover:hidden">
          {formatCompactDate(note.updatedAt, calendarLocale)}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setContextMenu({
              kind: 'note',
              note,
              x: Math.min(window.innerWidth - 210, rect.left),
              y: Math.min(window.innerHeight - 260, rect.bottom + 4),
            });
          }}
          className="hidden group-hover:flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          title="Note actions"
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex h-full w-full flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] select-none">
      {/* Brand Header */}
      <div className="flex h-13 shrink-0 items-center justify-between px-3.5">
        <button
          type="button"
          onClick={() => {
            onSelectSection('dashboard');
            onCloseMobile();
          }}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-white font-display text-sm font-bold">
            V
          </div>
          <span className="font-display text-base font-semibold tracking-tight text-[var(--text-primary)] whitespace-nowrap">
            Vellum
          </span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onCollapseDesktop}
            title="Collapse sidebar"
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] lg:hidden cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Primary Action & Search */}
      <div className="space-y-2 px-3 pb-3">
        <button
          type="button"
          onClick={() => {
            onCreateNote(activeSection === 'folder' ? activeFolderId : null);
            onCloseMobile();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          New Note
        </button>

        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <input
            type="text"
            value={sidebarFilter}
            onChange={(e) => setSidebarFilter(e.target.value)}
            placeholder="Filter tree..."
            className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onOpenSearch}
            title="Global search (Ctrl+K)"
            className="font-mono-tabular rounded px-1 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            ⌘K
          </button>
        </div>
      </div>

      {/* Scrollable Navigation + Hierarchical Tree */}
      <div className="flex-1 overflow-y-auto px-2 pb-6 space-y-4">
        {/* System Sections */}
        <nav className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectSection(item.id);
                  onCloseMobile();
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[var(--accent)]' : ''}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.count === 'number' && item.count > 0 && (
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick Access Pinned Items */}
        {(pinnedFolders.length > 0 || pinnedNotes.length > 0) && (
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <div className="mb-1 px-2.5 text-[11px] font-medium text-[var(--text-muted)]">
              Pinned
            </div>
            <div className="space-y-0.5">
              {pinnedFolders.map((pf) => (
                <button
                  key={`pin_${pf.id}`}
                  type="button"
                  onClick={() => {
                    onSelectFolder(pf.id);
                    onCloseMobile();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1 text-left text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <span className="text-xs">{pf.icon}</span>
                  <span className="truncate">{pf.name}</span>
                </button>
              ))}
              {pinnedNotes.map((pn) => (
                <button
                  key={`pin_${pn.id}`}
                  type="button"
                  onClick={() => {
                    onSelectNote(pn.id);
                    onCloseMobile();
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1 text-left text-[13px] cursor-pointer ${
                    activeSection === 'editor' && activeNoteId === pn.id
                      ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="text-xs">{pn.icon || '📄'}</span>
                  <span className="truncate">{pn.title || 'Untitled'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom Folders & Notes Tree */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverFolderId('root');
          }}
          onDragLeave={() => setDragOverFolderId(null)}
          onDrop={(e) => {
            e.preventDefault();
            handleDropOnFolder(null);
          }}
          className="border-t border-[var(--border-subtle)] pt-3"
        >
          <div
            className={`mb-1.5 flex items-center justify-between px-2.5 rounded-md ${
              dragOverFolderId === 'root' ? 'bg-[var(--accent-soft)]' : ''
            }`}
          >
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Folders
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onExpandCollapseAllFolders(!anyFolderExpanded)}
                title={anyFolderExpanded ? 'Collapse all folders' : 'Expand all folders'}
                className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {anyFolderExpanded ? 'Collapse' : 'Expand'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewFolderName('');
                  setNewFolderIcon('📁');
                  setNewFolderModal({ parentId: null });
                }}
                title="Create folder"
                className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-0.5">
            {rootFolders.map((rf) => renderFolderTree(rf, 0))}
            {rootNotes.map((rn) => renderNoteRow(rn, 0))}
            {rootFolders.length === 0 && rootNotes.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-[var(--text-muted)]">
                No folders or notes match
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Footer: Account Sync & Settings */}
      <div className="shrink-0 border-t border-[var(--border-subtle)] p-2.5 space-y-1.5">
        {user ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Account'}
                    referrerPolicy="no-referrer"
                    className="h-6 w-6 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">
                    {(user.displayName || user.email || 'U').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-[var(--text-primary)]">
                    {user.displayName || user.email}
                  </div>
                  <div className="truncate text-[10px] text-[var(--text-muted)]">
                    {driveConnected ? 'Firestore + Drive synced' : 'Firestore synced · Reconnect Drive'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                disabled={authBusy}
                title="Sign out"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
            {!driveConnected && (
              <GoogleSignInButton
                label={authBusy ? 'Connecting...' : 'Reconnect Drive'}
                disabled={authBusy}
                fullWidth
                onClick={() => {
                  onSignIn();
                  onCloseMobile();
                }}
              />
            )}
          </div>
        ) : (
          <GoogleSignInButton
            label={authBusy ? 'Connecting...' : 'Sign in with Google'}
            disabled={authBusy}
            fullWidth
            onClick={() => {
              onSignIn();
              onCloseMobile();
            }}
          />
        )}

        <button
          type="button"
          onClick={() => {
            onOpenSettings();
            onCloseMobile();
          }}
          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            <Settings className="h-4 w-4 shrink-0" />
            <span>Settings</span>
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {calendarLocale === 'fa' ? 'شمسی' : 'EN'}
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div
        style={{ width: `${liveWidth}px` }}
        className="relative hidden lg:block h-full shrink-0"
      >
        {sidebarContent}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize sidebar (double-click to reset)"
          onPointerDown={startResize}
          onDoubleClick={() => {
            setLiveWidth(272);
            liveWidthRef.current = 272;
            onResizeWidth(272);
          }}
          className={`absolute -right-1 top-0 bottom-0 z-30 w-2 cursor-col-resize transition-colors ${
            isResizing ? 'bg-[var(--accent)]/60' : 'hover:bg-[var(--accent)]/40'
          }`}
        />
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden bg-black/50 backdrop-blur-[2px]"
          onClick={onCloseMobile}
        >
          <div onClick={(e) => e.stopPropagation()} className="h-full w-72">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Right-click / Overflow Context Menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
            className="fixed w-48 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-[var(--shadow-popover)]"
          >
            {contextMenu.kind === 'folder' ? (
              <>
                <CtxBtn
                  label="New Note Inside"
                  onClick={() => {
                    onCreateNote(contextMenu.folder.id);
                    onUpdateFolder({ ...contextMenu.folder, isExpanded: true });
                    setContextMenu(null);
                  }}
                />
                <CtxBtn
                  label="New Subfolder"
                  onClick={() => {
                    setNewFolderName('');
                    setNewFolderIcon('📁');
                    setNewFolderModal({ parentId: contextMenu.folder.id });
                    setContextMenu(null);
                  }}
                />
                <CtxBtn
                  label="Rename"
                  onClick={() => startRename(contextMenu.folder.id, contextMenu.folder.name)}
                />
                <CtxBtn
                  label="Change Icon"
                  onClick={() => {
                    setEmojiFolderModal(contextMenu.folder);
                    setContextMenu(null);
                  }}
                />
                <CtxBtn
                  label={contextMenu.folder.isPinned ? 'Unpin Folder' : 'Pin to Quick Access'}
                  onClick={() => {
                    onUpdateFolder({
                      ...contextMenu.folder,
                      isPinned: !contextMenu.folder.isPinned,
                    });
                    setContextMenu(null);
                  }}
                />
                <CtxBtn
                  label="Move to..."
                  onClick={() => {
                    setMoveTargetModal({ kind: 'folder', id: contextMenu.folder.id });
                    setContextMenu(null);
                  }}
                />
                <div className="my-1 h-px bg-[var(--border-subtle)]" />
                <CtxBtn
                  label="Delete Folder"
                  danger
                  onClick={() => {
                    setDeleteFolderModal(contextMenu.folder);
                    setContextMenu(null);
                  }}
                />
              </>
            ) : (
              <>
                <CtxBtn
                  label="Open Note"
                  onClick={() => {
                    onSelectNote(contextMenu.note.id);
                    setContextMenu(null);
                  }}
                />
                <CtxBtn
                  label="Rename"
                  onClick={() => startRename(contextMenu.note.id, contextMenu.note.title)}
                />
                <CtxBtn
                  label="Duplicate"
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={() => {
                    onDuplicateNote(contextMenu.note);
                    setContextMenu(null);
                  }}
                />
                <CtxBtn
                  label={contextMenu.note.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
                  onClick={() => {
                    onUpdateNote({
                      ...contextMenu.note,
                      isFavorite: !contextMenu.note.isFavorite,
                    });
                    setContextMenu(null);
                  }}
                />
                <CtxBtn
                  label={contextMenu.note.isPinned ? 'Unpin' : 'Pin to Quick Access'}
                  onClick={() => {
                    onUpdateNote({
                      ...contextMenu.note,
                      isPinned: !contextMenu.note.isPinned,
                    });
                    setContextMenu(null);
                  }}
                />
                <CtxBtn
                  label="Move to Folder..."
                  onClick={() => {
                    setMoveTargetModal({ kind: 'note', id: contextMenu.note.id });
                    setContextMenu(null);
                  }}
                />
                <CtxBtn
                  label={contextMenu.note.isArchived ? 'Restore' : 'Archive'}
                  onClick={() => {
                    onUpdateNote({
                      ...contextMenu.note,
                      isArchived: !contextMenu.note.isArchived,
                    });
                    setContextMenu(null);
                  }}
                />
                <div className="my-1 h-px bg-[var(--border-subtle)]" />
                <CtxBtn
                  label="Delete Note"
                  danger
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => {
                    onDeleteNote(contextMenu.note.id);
                    setContextMenu(null);
                  }}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {newFolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setNewFolderModal(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (!newFolderName.trim()) return;
              onCreateFolder(newFolderName.trim(), newFolderModal.parentId, newFolderIcon);
              setNewFolderModal(null);
            }}
            className="w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-popover)]"
          >
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
              {newFolderModal.parentId ? 'New Subfolder' : 'New Folder'}
            </h3>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-1">
                {['📁', '🌿', '💼', '🔬', '📚', '🎓', '🗂️', '💡', '🎯', '🧭'].map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setNewFolderIcon(em)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-base cursor-pointer ${
                      newFolderIcon === em
                        ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]'
                        : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name..."
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFolderModal(null)}
                className="rounded-lg px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newFolderName.trim()}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 cursor-pointer"
              >
                Create Folder
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Folder Emoji Modal */}
      {emojiFolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEmojiFolderModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-popover)]"
          >
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] mb-3">
              Choose Icon for {emojiFolderModal.name}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    onUpdateFolder({ ...emojiFolderModal, icon: em });
                    setEmojiFolderModal(null);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-lg hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Move To Folder Modal */}
      {moveTargetModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setMoveTargetModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-popover)]"
          >
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)] mb-3">
              Move to Folder
            </h3>
            <div className="max-h-64 overflow-y-auto space-y-1">
              <button
                type="button"
                onClick={() => {
                  if (moveTargetModal.kind === 'note') {
                    onMoveNote(moveTargetModal.id, null);
                  } else {
                    onMoveFolder(moveTargetModal.id, null);
                  }
                  setMoveTargetModal(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                📂 Root (Top Level)
              </button>
              {folders
                .filter(
                  (f) =>
                    moveTargetModal.kind === 'note' ||
                    (f.id !== moveTargetModal.id && !isDescendant(f.id, moveTargetModal.id))
                )
                .map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      if (moveTargetModal.kind === 'note') {
                        onMoveNote(moveTargetModal.id, f.id);
                      } else {
                        onMoveFolder(moveTargetModal.id, f.id);
                      }
                      setMoveTargetModal(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <span>{f.icon}</span>
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Folder Confirmation Modal (Move contents vs Delete contents) */}
      {deleteFolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDeleteFolderModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-popover)]"
          >
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
              Delete "{deleteFolderModal.name}"?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Choose what happens to the notes and subfolders inside this folder.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  onDeleteFolder(deleteFolderModal.id, 'move_to_parent');
                  setDeleteFolderModal(null);
                }}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                Move contents to parent folder (keep all notes)
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteFolder(deleteFolderModal.id, 'delete_contents');
                  setDeleteFolderModal(null);
                }}
                className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-left text-xs font-medium text-red-500 hover:bg-red-500/20 cursor-pointer"
              >
                Delete folder and all contents inside
              </button>
              <button
                type="button"
                onClick={() => setDeleteFolderModal(null)}
                className="mt-1 w-full rounded-lg px-4 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CtxBtn({
  label,
  onClick,
  danger,
  icon,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
        danger
          ? 'text-red-500 hover:bg-red-500/10'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

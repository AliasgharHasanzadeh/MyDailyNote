import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { EditorContent, useEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Archive,
  ArchiveRestore,
  Calendar,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Copy,
  Download,
  FileUp,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Lightbulb,
  List,
  Menu,
  Minus,
  MoreHorizontal,
  Music,
  PanelRight,
  Pin,
  Plus,
  Quote,
  Redo2,
  Smile,
  Star,
  Trash2,
  Undo2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type DriveSaveStatus, uploadFileToDrive } from '../../db/googleDrive';
import { getDriveAccessToken } from '../../googleAuth';
import type { CalendarLocale, Folder, Note } from '../../types/workspace';
import { BUILT_IN_COVERS, MOOD_OPTIONS, QUICK_EMOJIS } from '../../types/workspace';
import {
  addDaysToKey,
  formatFileSize,
  formatFullDate,
  formatNumericDate,
  isAutoJournalTitle,
  toDateKey,
} from '../../utils/date';
import { extractPlainText, noteToMarkdown } from '../../utils/tiptap';
import { BLOCK_COMMANDS } from './blockCommands';
import type { MediaKind } from './blockCommands';
import { BlockGutter } from './BlockGutter';
import { AudioNode } from './extensions/AudioNode';
import { CalloutNode } from './extensions/CalloutNode';
import { FileAttachmentNode } from './extensions/FileAttachmentNode';
import { MediaImageNode } from './extensions/MediaImageNode';
import { useResolvedCoverUrl } from './extensions/useMediaUrl';
import { VideoNode } from './extensions/VideoNode';
import { MediaInsertDialog } from './MediaInsertDialog';
import { SelectionToolbar } from './SelectionToolbar';
import { SlashMenu } from './SlashMenu';

interface NoteEditorProps {
  note: Note;
  folders: Folder[];
  calendarLocale: CalendarLocale;
  saveState: 'saved' | 'saving';
  driveSaveStatus?: DriveSaveStatus;
  hasPendingDriveChanges?: boolean;
  onRequestSaveToDrive?: () => void;
  onRequestConnectDrive?: () => void;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  onOpenMobileSidebar: () => void;
  onUpdateNote: (updated: Note) => void;
  onDuplicateNote: (note: Note) => void;
  onDeleteNote: (noteId: string) => void;
  onSelectFolder: (folderId: string | null) => void;
  onOpenJournalDate: (dateKey: string) => void;
  onOpenJournalCalendar: () => void;
}

export function NoteEditor({
  note,
  folders,
  calendarLocale,
  saveState,
  driveSaveStatus,
  hasPendingDriveChanges,
  onRequestSaveToDrive,
  onRequestConnectDrive,
  rightPanelOpen,
  onToggleRightPanel,
  onOpenMobileSidebar,
  onUpdateNote,
  onDuplicateNote,
  onDeleteNote,
  onSelectFolder,
  onOpenJournalDate,
  onOpenJournalCalendar,
}: NoteEditorProps) {
  return (
    <NoteEditorCanvas
      key={note.id}
      note={note}
      folders={folders}
      calendarLocale={calendarLocale}
      saveState={saveState}
      driveSaveStatus={driveSaveStatus}
      hasPendingDriveChanges={hasPendingDriveChanges}
      onRequestSaveToDrive={onRequestSaveToDrive}
      onRequestConnectDrive={onRequestConnectDrive}
      rightPanelOpen={rightPanelOpen}
      onToggleRightPanel={onToggleRightPanel}
      onOpenMobileSidebar={onOpenMobileSidebar}
      onUpdateNote={onUpdateNote}
      onDuplicateNote={onDuplicateNote}
      onDeleteNote={onDeleteNote}
      onSelectFolder={onSelectFolder}
      onOpenJournalDate={onOpenJournalDate}
      onOpenJournalCalendar={onOpenJournalCalendar}
    />
  );
}

function NoteEditorCanvas({
  note,
  folders,
  calendarLocale,
  saveState,
  driveSaveStatus = 'disconnected',
  hasPendingDriveChanges,
  onRequestSaveToDrive,
  onRequestConnectDrive,
  rightPanelOpen,
  onToggleRightPanel,
  onOpenMobileSidebar,
  onUpdateNote,
  onDuplicateNote,
  onDeleteNote,
  onSelectFolder,
  onOpenJournalDate,
  onOpenJournalCalendar,
}: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [emojiMenuOpen, setEmojiMenuOpen] = useState(false);
  const [coverMenuOpen, setCoverMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [insertDropdownOpen, setInsertDropdownOpen] = useState(false);
  const [insertDropdownPos, setInsertDropdownPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [journalMetaOpen, setJournalMetaOpen] = useState(
    Boolean(
      note.journalMetadata?.mood ||
        note.journalMetadata?.rating ||
        (note.journalMetadata?.highlights && note.journalMetadata.highlights.length > 0)
    )
  );
  const [newHighlight, setNewHighlight] = useState('');
  const [editingCustomMood, setEditingCustomMood] = useState(false);
  const [customMoodInput, setCustomMoodInput] = useState('');

  const [mediaDialog, setMediaDialog] = useState<{
    kind: MediaKind;
    rangeToDelete?: { from: number; to: number };
    insertPos?: number;
  } | null>(null);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const customMoodInputRef = useRef<HTMLInputElement | null>(null);
  const latestNoteRef = useRef(note);
  latestNoteRef.current = note;

  const {
    resolvedUrl: resolvedCoverUrl,
    needsDriveAuth: coverNeedsDriveAuth,
    connectDrive: connectDriveForCover,
  } = useResolvedCoverUrl(note.coverImage);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
        dropcursor: { color: 'var(--accent)', width: 2 },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: 'Write freely, or type "/" to insert blocks...',
      }),
      CalloutNode,
      MediaImageNode,
      AudioNode,
      VideoNode,
      FileAttachmentNode,
    ],
    content: note.content,
    onUpdate: ({ editor: ed }) => {
      const json: JSONContent = ed.getJSON();
      const plainText = extractPlainText(json);
      const current = latestNoteRef.current;
      onUpdateNote({
        ...current,
        content: json,
        plainText,
        updatedAt: new Date().toISOString(),
      });
    },
  });

  useEffect(() => {
    setTitle(note.title);
  }, [note.title]);

  useEffect(() => {
    if (editingCustomMood) {
      customMoodInputRef.current?.focus();
    }
  }, [editingCustomMood]);

  const folderChain = useMemo(() => {
    const chain: Folder[] = [];
    let currentId = note.parentFolderId;
    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const found = folders.find((f) => f.id === currentId);
      if (!found) break;
      chain.unshift(found);
      currentId = found.parentId;
    }
    return chain;
  }, [folders, note.parentFolderId]);

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle);
    const current = latestNoteRef.current;
    onUpdateNote({
      ...current,
      title: nextTitle,
      isCustomJournalTitle: current.journalDate
        ? !isAutoJournalTitle(nextTitle, current.journalDate, false)
        : undefined,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleMediaInsert = (attrs: Record<string, unknown>) => {
    if (!editor || !mediaDialog) return;
    const nodeTypeMap: Record<MediaKind, string> = {
      image: 'mediaImage',
      audio: 'audioBlock',
      video: 'videoBlock',
      file: 'fileAttachment',
    };
    const type = nodeTypeMap[mediaDialog.kind];

    if (mediaDialog.rangeToDelete) {
      editor
        .chain()
        .focus()
        .deleteRange(mediaDialog.rangeToDelete)
        .insertContent([{ type, attrs }, { type: 'paragraph' }])
        .run();
    } else if (typeof mediaDialog.insertPos === 'number') {
      editor
        .chain()
        .focus()
        .insertContentAt(mediaDialog.insertPos, [{ type, attrs }, { type: 'paragraph' }])
        .run();
    } else {
      editor
        .chain()
        .focus()
        .insertContent([{ type, attrs }, { type: 'paragraph' }])
        .run();
    }
    setMediaDialog(null);
  };

  const commitCoverDataUrl = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!rawUrl) return;
      if (rawUrl.length <= 420000) {
        onUpdateNote({
          ...latestNoteRef.current,
          coverImage: rawUrl,
          updatedAt: new Date().toISOString(),
        });
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1400;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        onUpdateNote({
          ...latestNoteRef.current,
          coverImage: compressed.slice(0, 500000),
          updatedAt: new Date().toISOString(),
        });
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmCoverDriveUpload = async () => {
    if (!pendingCoverFile) return;
    const driveToken = getDriveAccessToken();
    if (!driveToken) {
      commitCoverDataUrl(pendingCoverFile);
      setPendingCoverFile(null);
      return;
    }
    setUploadingCover(true);
    try {
      const uploaded = await uploadFileToDrive(
        pendingCoverFile,
        pendingCoverFile.name || 'cover-image',
        pendingCoverFile.type || 'image/jpeg',
        driveToken
      );
      onUpdateNote({
        ...latestNoteRef.current,
        coverImage: `drive:${uploaded.id}`,
        updatedAt: new Date().toISOString(),
      });
      setPendingCoverFile(null);
    } catch {
      commitCoverDataUrl(pendingCoverFile);
      setPendingCoverFile(null);
    } finally {
      setUploadingCover(false);
    }
  };

  const handleUploadCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverMenuOpen(false);
    e.target.value = '';

    if (getDriveAccessToken()) {
      setPendingCoverFile(file);
      return;
    }
    commitCoverDataUrl(file);
  };

  const handleExportMarkdown = () => {
    const md = noteToMarkdown(note);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(note.title || 'note').replace(/[^a-z0-9-_]+/gi, '_')}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setMoreMenuOpen(false);
  };

  const updateJournalMetadata = (patch: Partial<NonNullable<Note['journalMetadata']>>) => {
    const current = latestNoteRef.current;
    onUpdateNote({
      ...current,
      journalMetadata: {
        ...current.journalMetadata,
        ...patch,
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const addHighlight = (e: React.FormEvent) => {
    e.preventDefault();
    const val = newHighlight.trim();
    if (!val) return;
    const prev = note.journalMetadata?.highlights || [];
    updateJournalMetadata({ highlights: [...prev, val] });
    setNewHighlight('');
  };

  const currentMood = note.journalMetadata?.mood;
  const isPresetMood = Boolean(
    currentMood && MOOD_OPTIONS.some((m) => m.value === currentMood)
  );
  const hasCustomMood = Boolean(currentMood && !isPresetMood);

  const saveCustomMood = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = customMoodInput.trim();
    updateJournalMetadata({ mood: trimmed || undefined });
    setEditingCustomMood(false);
  };

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)]">
      {/* Top Document Header */}
      <header className="flex h-13 shrink-0 items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] lg:hidden cursor-pointer"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>

          {note.journalDate ? (
            <div className="flex items-center gap-1.5 truncate">
              <button
                type="button"
                onClick={onOpenJournalCalendar}
                className="hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
              >
                Daily Journal
              </button>
              <span aria-hidden="true" className="text-[var(--text-muted)]">/</span>
              <span className="truncate font-medium text-[var(--text-primary)] tabular-nums">
                {formatNumericDate(note.journalDate, calendarLocale)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 truncate">
              {folderChain.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onSelectFolder(null)}
                  className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  All Notes
                </button>
              ) : (
                folderChain.map((fld, i) => (
                  <span key={fld.id} className="flex items-center gap-1.5 min-w-0">
                    {i > 0 && <span className="text-[var(--text-muted)]">/</span>}
                    <button
                      type="button"
                      onClick={() => onSelectFolder(fld.id)}
                      className="truncate hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      {fld.icon} {fld.name}
                    </button>
                  </span>
                ))
              )}
              <span className="text-[var(--text-muted)]">/</span>
              <span className="truncate font-medium text-[var(--text-primary)]">
                {title || 'Untitled'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {driveSaveStatus === 'disconnected' ? (
            <button
              type="button"
              onClick={onRequestConnectDrive}
              title="Browser storage is temporary. Connect Google Drive to save permanently."
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 cursor-pointer whitespace-nowrap"
            >
              <Cloud className="h-3.5 w-3.5" />
              Not in Drive · Connect
            </button>
          ) : driveSaveStatus === 'saving' || saveState === 'saving' ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-xs text-[var(--text-secondary)] whitespace-nowrap">
              <Cloud className="h-3.5 w-3.5 animate-pulse text-[var(--accent)]" />
              Saving to Drive...
            </span>
          ) : driveSaveStatus === 'error' ? (
            <button
              type="button"
              onClick={onRequestSaveToDrive}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 cursor-pointer whitespace-nowrap"
            >
              <Cloud className="h-3.5 w-3.5" />
              Drive error · Retry
            </button>
          ) : driveSaveStatus === 'manual' || hasPendingDriveChanges ? (
            <button
              type="button"
              onClick={onRequestSaveToDrive}
              title="Save changes to Google Drive (Ctrl+S)"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap"
            >
              <Cloud className="h-3.5 w-3.5" />
              Save to Drive
            </button>
          ) : (
            <button
              type="button"
              onClick={onRequestSaveToDrive}
              title="All changes auto-saved to Google Drive (Click to save snapshot)"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15 cursor-pointer whitespace-nowrap"
            >
              <Check className="h-3.5 w-3.5" />
              Saved to Drive
            </button>
          )}

          <button
            type="button"
            onClick={() => onUpdateNote({ ...note, isFavorite: !note.isFavorite })}
            title={note.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
              note.isFavorite
                ? 'text-amber-400 hover:bg-[var(--bg-hover)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Star className={`h-4 w-4 ${note.isFavorite ? 'fill-amber-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => onUpdateNote({ ...note, isPinned: !note.isPinned })}
            title={note.isPinned ? 'Unpin note' : 'Pin to Quick Access'}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
              note.isPinned
                ? 'text-[var(--accent)] bg-[var(--accent-soft)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Pin className="h-4 w-4" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreMenuOpen((prev) => !prev)}
              title="Note options"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {moreMenuOpen && (
              <div className="absolute right-0 top-10 z-40 w-48 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-[var(--shadow-popover)]">
                <button
                  type="button"
                  onClick={() => {
                    onDuplicateNote(note);
                    setMoreMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate note
                </button>
                <button
                  type="button"
                  onClick={handleExportMarkdown}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export Markdown
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateNote({ ...note, isArchived: !note.isArchived });
                    setMoreMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {note.isArchived ? (
                    <>
                      <ArchiveRestore className="h-3.5 w-3.5" />
                      Restore from archive
                    </>
                  ) : (
                    <>
                      <Archive className="h-3.5 w-3.5" />
                      Archive note
                    </>
                  )}
                </button>
                <div className="my-1 h-px bg-[var(--border-subtle)]" />
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onDeleteNote(note.id);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-red-500 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete permanently
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleRightPanel}
            title="Toggle inspector panel"
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
              rightPanelOpen
                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Subtle Formatting & Block Insertion Ribbon */}
      {editor && (
        <div className="flex shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-1.5 lg:px-6">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              title="Undo (Ctrl+Z)"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 cursor-pointer"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              title="Redo (Ctrl+Shift+Z)"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 cursor-pointer"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>

            <div className="mx-1.5 h-4 w-px bg-[var(--border-subtle)]" />

            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  if (insertDropdownOpen) {
                    setInsertDropdownOpen(false);
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect();
                  setInsertDropdownPos({
                    top: rect.bottom + 6,
                    left: Math.min(window.innerWidth - 270, Math.max(8, rect.left)),
                  });
                  setInsertDropdownOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5 text-[var(--accent)]" />
                Insert block
              </button>
              {insertDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setInsertDropdownOpen(false)}
                  />
                  <div
                    style={{ top: insertDropdownPos.top, left: insertDropdownPos.left }}
                    className="fixed z-50 w-64 max-h-[min(380px,70vh)] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-[var(--shadow-popover)]"
                  >
                    <div className="px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                      Insert block at cursor
                    </div>
                    {BLOCK_COMMANDS.map((cmd) => {
                      const Icon = cmd.icon;
                      return (
                        <button
                          key={cmd.id}
                          type="button"
                          onClick={() => {
                            setInsertDropdownOpen(false);
                            if (cmd.mediaKind) {
                              setMediaDialog({ kind: cmd.mediaKind });
                            } else {
                              cmd.execute(editor);
                            }
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-[var(--text-primary)]">{cmd.label}</div>
                            <div className="truncate text-[10px] text-[var(--text-muted)]">
                              {cmd.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="mx-1.5 h-4 w-px bg-[var(--border-subtle)]" />

            <ToolbarIconBtn
              active={editor.isActive('heading', { level: 1 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              title="Heading 1"
              icon={<Heading1 className="h-3.5 w-3.5" />}
            />
            <ToolbarIconBtn
              active={editor.isActive('heading', { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              title="Heading 2"
              icon={<Heading2 className="h-3.5 w-3.5" />}
            />
            <ToolbarIconBtn
              active={editor.isActive('taskList')}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              title="Checklist"
              icon={<CheckSquare className="h-3.5 w-3.5" />}
            />
            <ToolbarIconBtn
              active={editor.isActive('bulletList')}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="Bullet List"
              icon={<List className="h-3.5 w-3.5" />}
            />
            <ToolbarIconBtn
              active={editor.isActive('blockquote')}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              title="Quote"
              icon={<Quote className="h-3.5 w-3.5" />}
            />
            <ToolbarIconBtn
              active={editor.isActive('callout')}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: 'callout',
                    attrs: { emoji: '💡' },
                    content: [{ type: 'paragraph' }],
                  })
                  .run()
              }
              title="Callout block"
              icon={<Lightbulb className="h-3.5 w-3.5" />}
            />
            <ToolbarIconBtn
              active={false}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              title="Divider"
              icon={<Minus className="h-3.5 w-3.5" />}
            />

            <div className="mx-1.5 h-4 w-px bg-[var(--border-subtle)]" />

            <ToolbarIconBtn
              active={false}
              onClick={() => setMediaDialog({ kind: 'image' })}
              title="Insert Image"
              icon={<ImageIcon className="h-3.5 w-3.5" />}
            />
            <ToolbarIconBtn
              active={false}
              onClick={() => setMediaDialog({ kind: 'audio' })}
              title="Insert Audio"
              icon={<Music className="h-3.5 w-3.5" />}
            />
            <ToolbarIconBtn
              active={false}
              onClick={() => setMediaDialog({ kind: 'video' })}
              title="Embed Video"
              icon={<Video className="h-3.5 w-3.5" />}
            />
            <ToolbarIconBtn
              active={false}
              onClick={() => setMediaDialog({ kind: 'file' })}
              title="Attach File"
              icon={<FileUp className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      )}

      {/* Main Scrollable Document Sheet */}
      <div className="flex-1 overflow-y-auto">
        {note.coverImage && (
          <div className="group relative h-44 w-full overflow-hidden border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] sm:h-52">
            {coverNeedsDriveAuth ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
                <span>Cover image stored in Google Drive</span>
                <button
                  type="button"
                  onClick={connectDriveForCover}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
                >
                  Connect Google Drive
                </button>
              </div>
            ) : resolvedCoverUrl ? (
              <img
                src={resolvedCoverUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-3 right-4 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => setCoverMenuOpen((prev) => !prev)}
                className="rounded-lg bg-[var(--bg-surface)]/90 px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] backdrop-blur-sm hover:bg-[var(--bg-surface)] cursor-pointer"
              >
                Change cover
              </button>
              <button
                type="button"
                onClick={() => onUpdateNote({ ...note, coverImage: null })}
                className="rounded-lg bg-[var(--bg-surface)]/90 px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] backdrop-blur-sm hover:text-red-500 cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        )}

        <div className="mx-auto w-full max-w-[820px] px-6 py-8 sm:px-12 lg:px-14">
          {/* Optional Journal Day Navigation & Optional Metadata Bar */}
          {note.journalDate && (
            <div className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenJournalDate(addDaysToKey(note.journalDate!, -1))}
                    title="Previous day"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span
                    dir={calendarLocale === 'fa' ? 'rtl' : 'ltr'}
                    className="text-xs font-medium text-[var(--text-primary)] tabular-nums px-1"
                  >
                    {formatFullDate(note.journalDate, calendarLocale)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenJournalDate(addDaysToKey(note.journalDate!, 1))}
                    title="Next day"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  {note.journalDate !== toDateKey() && (
                    <button
                      type="button"
                      onClick={() => onOpenJournalDate(toDateKey())}
                      className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] cursor-pointer"
                    >
                      Today
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setJournalMetaOpen((prev) => !prev)}
                    className="rounded-md px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    {journalMetaOpen ? 'Hide daily reflection' : 'Mood & highlights'}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenJournalCalendar}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    Calendar
                  </button>
                </div>
              </div>

              {journalMetaOpen && (
                <div className="mt-3 space-y-3 border-t border-[var(--border-subtle)] pt-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-[var(--text-muted)]">Mood:</span>
                      <div className="flex flex-wrap items-center gap-1">
                        {MOOD_OPTIONS.map((m) => {
                          const active = currentMood === m.value;
                          return (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => {
                                setEditingCustomMood(false);
                                updateJournalMetadata({ mood: active ? undefined : m.value });
                              }}
                              className={`rounded-md px-2 py-1 text-xs transition-colors cursor-pointer ${
                                active
                                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
                                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                              }`}
                            >
                              {m.emoji} {m.value}
                            </button>
                          );
                        })}

                        {editingCustomMood ? (
                          <form
                            onSubmit={saveCustomMood}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/50 bg-[var(--bg-canvas)] px-2 py-0.5"
                          >
                            <span className="text-xs">💭</span>
                            <input
                              ref={customMoodInputRef}
                              type="text"
                              dir="auto"
                              value={customMoodInput}
                              onChange={(e) => setCustomMoodInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setEditingCustomMood(false);
                                }
                              }}
                              placeholder="Type your mood..."
                              maxLength={40}
                              className="w-28 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                            />
                            <button
                              type="submit"
                              title="Save mood"
                              className="text-[var(--accent)] hover:opacity-80 cursor-pointer"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCustomMood(false)}
                              title="Cancel"
                              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </form>
                        ) : hasCustomMood ? (
                          <div className="inline-flex items-center gap-0.5 rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--accent)]">
                            <button
                              type="button"
                              dir="auto"
                              onClick={() => {
                                setCustomMoodInput(currentMood || '');
                                setEditingCustomMood(true);
                              }}
                              title="Edit custom mood"
                              className="inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>💭</span>
                              <span>{currentMood}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateJournalMetadata({ mood: undefined })}
                              title="Clear mood"
                              className="ml-0.5 text-[var(--accent)]/70 hover:text-[var(--accent)] cursor-pointer"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomMoodInput('');
                              setEditingCustomMood(true);
                            }}
                            className="rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                          >
                            💭 Other
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[var(--text-muted)]">Day rating:</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((num) => {
                          const active = (note.journalMetadata?.rating || 0) >= num;
                          return (
                            <button
                              key={num}
                              type="button"
                              onClick={() =>
                                updateJournalMetadata({
                                  rating: note.journalMetadata?.rating === num ? undefined : num,
                                })
                              }
                              className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-mono-tabular transition-colors cursor-pointer ${
                                active
                                  ? 'bg-[var(--accent)] text-white'
                                  : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              {num}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">Highlights:</span>
                      {(note.journalMetadata?.highlights || []).map((hl, idx) => (
                        <span
                          key={`${hl}-${idx}`}
                          className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]"
                        >
                          <span>· {hl}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = (note.journalMetadata?.highlights || []).filter(
                                (_, i) => i !== idx
                              );
                              updateJournalMetadata({ highlights: next });
                            }}
                            className="text-[var(--text-muted)] hover:text-red-500 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <form onSubmit={addHighlight} className="inline-flex items-center gap-1">
                        <input
                          type="text"
                          value={newHighlight}
                          onChange={(e) => setNewHighlight(e.target.value)}
                          placeholder="+ Add highlight..."
                          className="w-36 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                        />
                        {newHighlight.trim() && (
                          <button
                            type="submit"
                            className="text-xs font-medium text-[var(--accent)] cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Page Controls: Icon & Cover */}
          <div className="group/header mb-3 flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setEmojiMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {note.icon ? (
                  <span className="text-2xl leading-none">{note.icon}</span>
                ) : (
                  <>
                    <Smile className="h-3.5 w-3.5" />
                    <span>Add icon</span>
                  </>
                )}
              </button>
              {emojiMenuOpen && (
                <div className="absolute left-0 top-10 z-40 w-60 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 shadow-[var(--shadow-popover)]">
                  <div className="flex flex-wrap gap-1">
                    {QUICK_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => {
                          onUpdateNote({ ...note, icon: em });
                          setEmojiMenuOpen(false);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-base hover:bg-[var(--bg-hover)] cursor-pointer"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                  {note.icon && (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateNote({ ...note, icon: null });
                        setEmojiMenuOpen(false);
                      }}
                      className="mt-2 w-full rounded-md py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-red-500 cursor-pointer"
                    >
                      Remove icon
                    </button>
                  )}
                </div>
              )}
            </div>

            {!note.coverImage && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCoverMenuOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>Add cover</span>
                </button>
              </div>
            )}

            {coverMenuOpen && (
              <div className="relative z-40">
                <div className="absolute left-0 top-6 w-72 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-popover)]">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      Choose cover
                    </span>
                    <button
                      type="button"
                      onClick={() => setCoverMenuOpen(false)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {BUILT_IN_COVERS.map((cov) => (
                      <button
                        key={cov.id}
                        type="button"
                        onClick={() => {
                          onUpdateNote({ ...note, coverImage: cov.url });
                          setCoverMenuOpen(false);
                        }}
                        className="group/cov overflow-hidden rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent)] cursor-pointer"
                      >
                        <img
                          src={cov.url}
                          alt={cov.label}
                          referrerPolicy="no-referrer"
                          className="h-12 w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadCover}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload image
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Editable Document Title */}
          <input
            type="text"
            dir="auto"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                editor?.commands.focus('start');
              }
            }}
            placeholder="Untitled note"
            className="font-display mb-5 w-full bg-transparent text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />

          {/* Freeform TipTap Canvas with Left Block Gutter */}
          <div ref={canvasRef} className="vellum-editor relative pl-12 -ml-12">
            <BlockGutter
              editor={editor}
              containerRef={canvasRef}
              onRequestMediaAtPos={(kind, insertPos) =>
                setMediaDialog({ kind, insertPos })
              }
            />
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <SelectionToolbar editor={editor} />
      <SlashMenu
        editor={editor}
        onRequestMedia={(kind, rangeToDelete) =>
          setMediaDialog({ kind, rangeToDelete })
        }
      />

      {mediaDialog && (
        <MediaInsertDialog
          kind={mediaDialog.kind}
          onClose={() => setMediaDialog(null)}
          onInsert={handleMediaInsert}
        />
      )}

      {pendingCoverFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onClick={() => !uploadingCover && setPendingCoverFile(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-popover)] space-y-4"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Upload className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                  Upload Cover Image to Google Drive?
                </h3>
                <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                  {pendingCoverFile.name} ({formatFileSize(pendingCoverFile.size)})
                </p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              This image will be uploaded at 100% original quality into{' '}
              <span className="font-medium text-[var(--text-primary)]">
                Google Drive › Vellum Workspace › Media
              </span>
              .
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={uploadingCover}
                onClick={() => setPendingCoverFile(null)}
                className="rounded-lg border border-[var(--border-subtle)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploadingCover}
                onClick={handleConfirmCoverDriveUpload}
                className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-50"
              >
                {uploadingCover ? 'Uploading...' : 'Confirm Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarIconBtn({
  active,
  onClick,
  title,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      {icon}
    </button>
  );
}

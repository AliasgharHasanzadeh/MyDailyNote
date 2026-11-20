import type { Editor } from '@tiptap/react';
import { useEffect, useMemo, useState } from 'react';
import { BLOCK_COMMANDS } from './blockCommands';
import type { BlockCommandItem, MediaKind } from './blockCommands';

interface SlashMenuProps {
  editor: Editor | null;
  onRequestMedia: (kind: MediaKind, rangeToDelete?: { from: number; to: number }) => void;
}

export function SlashMenu({ editor, onRequestMedia }: SlashMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BLOCK_COMMANDS;
    return BLOCK_COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.keywords.some((k) => k.includes(q))
    );
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  useEffect(() => {
    if (!editor) return;

    const checkSlash = () => {
      const { state, view } = editor;
      const { selection } = state;
      if (!selection.empty) {
        setOpen(false);
        return;
      }

      const $from = selection.$from;
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
      const match = textBefore.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);

      if (match) {
        const slashOffset = textBefore.lastIndexOf('/');
        const from = $from.start() + slashOffset;
        const to = selection.from;
        const pos = view.coordsAtPos(selection.from);
        setRange({ from, to });
        setQuery(match[1] || '');
        setCoords({
          top: Math.min(window.innerHeight - 320, pos.bottom + 8),
          left: Math.min(window.innerWidth - 290, pos.left),
        });
        setOpen(true);
      } else {
        setOpen(false);
      }
    };

    editor.on('update', checkSlash);
    editor.on('selectionUpdate', checkSlash);

    return () => {
      editor.off('update', checkSlash);
      editor.off('selectionUpdate', checkSlash);
    };
  }, [editor]);

  const runCommand = (cmd: BlockCommandItem) => {
    if (!editor || !range) return;
    if (cmd.mediaKind) {
      const currentRange = { ...range };
      setOpen(false);
      onRequestMedia(cmd.mediaKind, currentRange);
      return;
    }
    editor.chain().focus().deleteRange(range).run();
    cmd.execute(editor);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        runCommand(filtered[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, filtered, selectedIndex]);

  if (!open || filtered.length === 0) return null;

  return (
    <div
      style={{ top: coords.top, left: coords.left }}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-40 w-68 max-h-76 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-[var(--shadow-popover)]"
    >
      <div className="px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-muted)]">
        Insert block
      </div>
      {filtered.map((cmd, idx) => {
        const Icon = cmd.icon;
        const active = idx === selectedIndex;
        return (
          <button
            key={cmd.id}
            type="button"
            onClick={() => runCommand(cmd)}
            onMouseEnter={() => setSelectedIndex(idx)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer ${
              active
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-[var(--text-primary)]">{cmd.label}</div>
              <div className="truncate text-[11px] text-[var(--text-muted)]">{cmd.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

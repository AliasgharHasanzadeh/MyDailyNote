import type { Editor } from '@tiptap/react';
import {
  Bold,
  Check,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Underline,
  Unlink,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface SelectionToolbarProps {
  editor: Editor | null;
}

export function SelectionToolbar({ editor }: SelectionToolbarProps) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      const { state, view } = editor;
      const { selection } = state;

      if (selection.empty || !editor.isFocused) {
        if (!linkOpen) setCoords(null);
        return;
      }

      // Avoid showing over atom media nodes
      if (
        editor.isActive('mediaImage') ||
        editor.isActive('audioBlock') ||
        editor.isActive('videoBlock') ||
        editor.isActive('fileAttachment')
      ) {
        setCoords(null);
        return;
      }

      const from = view.coordsAtPos(selection.from);
      const to = view.coordsAtPos(selection.to);
      const centerX = (from.left + to.right) / 2;
      const top = Math.max(12, from.top - 48);
      setCoords({ top, left: Math.max(160, Math.min(window.innerWidth - 180, centerX)) });
    };

    editor.on('selectionUpdate', update);
    editor.on('blur', () => {
      setTimeout(() => {
        if (!linkOpen) setCoords(null);
      }, 150);
    });

    return () => {
      editor.off('selectionUpdate', update);
    };
  }, [editor, linkOpen]);

  if (!editor || !coords) return null;

  const applyLink = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
    } else {
      const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      editor.chain().focus().setLink({ href: normalized }).run();
    }
    setLinkOpen(false);
    setLinkUrl('');
  };

  const btnCls = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors cursor-pointer ${
      active
        ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
    }`;

  return (
    <div
      style={{ top: coords.top, left: coords.left, transform: 'translateX(-50%)' }}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-40 flex items-center gap-0.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1 shadow-[var(--shadow-popover)]"
    >
      {linkOpen ? (
        <form onSubmit={applyLink} className="flex items-center gap-1 px-1">
          <input
            type="text"
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="w-44 bg-transparent px-1.5 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <button
            type="submit"
            className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent)] text-white cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </form>
      ) : (
        <>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={btnCls(editor.isActive('bold'))}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={btnCls(editor.isActive('italic'))}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={btnCls(editor.isActive('underline'))}
            title="Underline"
          >
            <Underline className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={btnCls(editor.isActive('strike'))}
            title="Strikethrough"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={btnCls(editor.isActive('code'))}
            title="Inline code"
          >
            <Code className="h-3.5 w-3.5" />
          </button>
          <div className="mx-0.5 h-4 w-px bg-[var(--border-subtle)]" />
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={btnCls(editor.isActive('heading', { level: 1 }))}
            title="Heading 1"
          >
            <Heading1 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={btnCls(editor.isActive('heading', { level: 2 }))}
            title="Heading 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </button>
          <div className="mx-0.5 h-4 w-px bg-[var(--border-subtle)]" />
          <button
            type="button"
            onClick={() => {
              const prev = editor.getAttributes('link').href || '';
              setLinkUrl(prev);
              setLinkOpen(true);
            }}
            className={btnCls(editor.isActive('link'))}
            title="Add link"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </button>
          {editor.isActive('link') && (
            <button
              type="button"
              onClick={() => editor.chain().focus().unsetLink().run()}
              className={btnCls(false)}
              title="Remove link"
            >
              <Unlink className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

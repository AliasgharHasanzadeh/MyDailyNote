import type { Editor } from '@tiptap/react';
import {
  CheckSquare,
  Code2,
  FileUp,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  Minus,
  Music,
  Pilcrow,
  Quote,
  Terminal,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type MediaKind = 'image' | 'audio' | 'video' | 'file';
export type BlockCategory = 'typography' | 'dev' | 'attachment';
export type BlockActionKind = 'link';

export const BLOCK_CATEGORY_META: ReadonlyArray<{
  id: BlockCategory;
  label: string;
}> = [
  { id: 'typography', label: 'Typography' },
  { id: 'dev', label: 'Dev' },
  { id: 'attachment', label: 'Attachment' },
];

export interface BlockCommandItem {
  id: string;
  category: BlockCategory;
  label: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  mediaKind?: MediaKind;
  actionKind?: BlockActionKind;
  execute: (editor: Editor, insertPos?: number) => void;
}

function insertOrReplaceAt(editor: Editor, insertPos: number | undefined, run: () => void) {
  if (typeof insertPos === 'number') {
    editor.chain().focus().setTextSelection(insertPos).run();
  } else {
    editor.chain().focus().run();
  }
  run();
}

export const BLOCK_COMMANDS: BlockCommandItem[] = [
  // Typography
  {
    id: 'paragraph',
    category: 'typography',
    label: 'Text',
    description: 'Plain paragraph block',
    keywords: ['text', 'paragraph', 'p', 'typography'],
    icon: Pilcrow,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().setParagraph().run()),
  },
  {
    id: 'h1',
    category: 'typography',
    label: 'Heading 1',
    description: 'Large section heading',
    keywords: ['h1', 'heading', 'title', 'typography'],
    icon: Heading1,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleHeading({ level: 1 }).run()),
  },
  {
    id: 'h2',
    category: 'typography',
    label: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['h2', 'heading', 'subtitle', 'typography'],
    icon: Heading2,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleHeading({ level: 2 }).run()),
  },
  {
    id: 'h3',
    category: 'typography',
    label: 'Heading 3',
    description: 'Small section heading',
    keywords: ['h3', 'heading', 'typography'],
    icon: Heading3,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleHeading({ level: 3 }).run()),
  },
  {
    id: 'checklist',
    category: 'typography',
    label: 'Checklist',
    description: 'Interactive to-do checkboxes',
    keywords: ['todo', 'task', 'checkbox', 'checklist', 'typography'],
    icon: CheckSquare,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleTaskList().run()),
  },
  {
    id: 'bullet_list',
    category: 'typography',
    label: 'Bullet List',
    description: 'Unordered bullet points',
    keywords: ['bullet', 'list', 'ul', 'typography'],
    icon: List,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleBulletList().run()),
  },
  {
    id: 'ordered_list',
    category: 'typography',
    label: 'Numbered List',
    description: 'Ordered sequential list',
    keywords: ['numbered', 'ordered', 'ol', '1', 'typography'],
    icon: ListOrdered,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleOrderedList().run()),
  },
  {
    id: 'callout',
    category: 'typography',
    label: 'Callout',
    description: 'Highlighted note or reminder block',
    keywords: ['callout', 'reminder', 'note', 'tip', 'typography'],
    icon: Lightbulb,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () =>
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'callout',
            attrs: { emoji: '💡' },
            content: [{ type: 'paragraph' }],
          })
          .run()
      ),
  },
  {
    id: 'quote',
    category: 'typography',
    label: 'Quote',
    description: 'Editorial blockquote',
    keywords: ['quote', 'blockquote', 'typography'],
    icon: Quote,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleBlockquote().run()),
  },
  {
    id: 'divider',
    category: 'typography',
    label: 'Divider',
    description: 'Horizontal section separator',
    keywords: ['divider', 'hr', 'line', 'separator', 'typography'],
    icon: Minus,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().setHorizontalRule().run()),
  },

  // Dev
  {
    id: 'code_block',
    category: 'dev',
    label: 'Code Block',
    description: 'Monospace code snippet',
    keywords: ['code', 'snippet', 'pre', 'dev'],
    icon: Code2,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleCodeBlock().run()),
  },
  {
    id: 'terminal',
    category: 'dev',
    label: 'Terminal Simulator',
    description: 'Interactive shell & command output block',
    keywords: ['terminal', 'shell', 'cli', 'bash', 'console', 'simulator', 'dev'],
    icon: Terminal,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () =>
        editor
          .chain()
          .focus()
          .insertContent([{ type: 'terminalBlock' }, { type: 'paragraph' }])
          .run()
      ),
  },

  // Attachment
  {
    id: 'link',
    category: 'attachment',
    label: 'Link',
    description: 'Insert a clickable web URL or reference',
    keywords: ['link', 'url', 'href', 'anchor', 'web', 'attachment'],
    icon: Link2,
    actionKind: 'link',
    execute: () => {},
  },
  {
    id: 'image',
    category: 'attachment',
    label: 'Image',
    description: 'Upload photo or paste image URL',
    keywords: ['image', 'photo', 'picture', 'img', 'attachment'],
    icon: ImageIcon,
    mediaKind: 'image',
    execute: () => {},
  },
  {
    id: 'audio',
    category: 'attachment',
    label: 'Audio',
    description: 'Embed music or voice recording',
    keywords: ['audio', 'music', 'voice', 'sound', 'mp3', 'attachment'],
    icon: Music,
    mediaKind: 'audio',
    execute: () => {},
  },
  {
    id: 'video',
    category: 'attachment',
    label: 'Video',
    description: 'YouTube, Vimeo, or video file',
    keywords: ['video', 'youtube', 'vimeo', 'embed', 'mp4', 'attachment'],
    icon: Video,
    mediaKind: 'video',
    execute: () => {},
  },
  {
    id: 'file',
    category: 'attachment',
    label: 'File',
    description: 'Attach any document or archive',
    keywords: ['file', 'attachment', 'pdf', 'upload'],
    icon: FileUp,
    mediaKind: 'file',
    execute: () => {},
  },
];

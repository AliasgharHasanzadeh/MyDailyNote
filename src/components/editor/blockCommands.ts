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
  List,
  ListOrdered,
  Minus,
  Music,
  Pilcrow,
  Quote,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type MediaKind = 'image' | 'audio' | 'video' | 'file';

export interface BlockCommandItem {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  mediaKind?: MediaKind;
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
  {
    id: 'paragraph',
    label: 'Text',
    description: 'Plain paragraph block',
    keywords: ['text', 'paragraph', 'p'],
    icon: Pilcrow,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().setParagraph().run()),
  },
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Large section heading',
    keywords: ['h1', 'heading', 'title'],
    icon: Heading1,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleHeading({ level: 1 }).run()),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['h2', 'heading', 'subtitle'],
    icon: Heading2,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleHeading({ level: 2 }).run()),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Small section heading',
    keywords: ['h3', 'heading'],
    icon: Heading3,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleHeading({ level: 3 }).run()),
  },
  {
    id: 'checklist',
    label: 'Checklist',
    description: 'Interactive to-do checkboxes',
    keywords: ['todo', 'task', 'checkbox', 'checklist'],
    icon: CheckSquare,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleTaskList().run()),
  },
  {
    id: 'bullet_list',
    label: 'Bullet List',
    description: 'Unordered bullet points',
    keywords: ['bullet', 'list', 'ul'],
    icon: List,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleBulletList().run()),
  },
  {
    id: 'ordered_list',
    label: 'Numbered List',
    description: 'Ordered sequential list',
    keywords: ['numbered', 'ordered', 'ol', '1'],
    icon: ListOrdered,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleOrderedList().run()),
  },
  {
    id: 'callout',
    label: 'Callout',
    description: 'Highlighted note or reminder block',
    keywords: ['callout', 'reminder', 'note', 'tip'],
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
    label: 'Quote',
    description: 'Editorial blockquote',
    keywords: ['quote', 'blockquote'],
    icon: Quote,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleBlockquote().run()),
  },
  {
    id: 'code_block',
    label: 'Code Block',
    description: 'Monospace code snippet',
    keywords: ['code', 'snippet', 'pre'],
    icon: Code2,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().toggleCodeBlock().run()),
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal section separator',
    keywords: ['divider', 'hr', 'line', 'separator'],
    icon: Minus,
    execute: (editor, pos) =>
      insertOrReplaceAt(editor, pos, () => editor.chain().focus().setHorizontalRule().run()),
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Upload photo or paste image URL',
    keywords: ['image', 'photo', 'picture', 'img'],
    icon: ImageIcon,
    mediaKind: 'image',
    execute: () => {},
  },
  {
    id: 'audio',
    label: 'Audio',
    description: 'Embed music or voice recording',
    keywords: ['audio', 'music', 'voice', 'sound', 'mp3'],
    icon: Music,
    mediaKind: 'audio',
    execute: () => {},
  },
  {
    id: 'video',
    label: 'Video',
    description: 'YouTube, Vimeo, or video file',
    keywords: ['video', 'youtube', 'vimeo', 'embed', 'mp4'],
    icon: Video,
    mediaKind: 'video',
    execute: () => {},
  },
  {
    id: 'file',
    label: 'File Attachment',
    description: 'Attach any document or archive',
    keywords: ['file', 'attachment', 'pdf', 'upload'],
    icon: FileUp,
    mediaKind: 'file',
    execute: () => {},
  },
];

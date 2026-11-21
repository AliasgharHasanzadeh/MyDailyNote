import type { JSONContent } from '@tiptap/react';
import type { Note } from '../types/workspace';

export const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
    },
  ],
};

export function extractPlainText(node: JSONContent | undefined | null): string {
  if (!node) return '';
  const parts: string[] = [];

  const walk = (n: JSONContent) => {
    if (n.text) {
      parts.push(n.text);
    }
    if (n.type === 'audioBlock' && n.attrs?.title) {
      parts.push(String(n.attrs.title));
    }
    if (n.type === 'fileAttachment' && n.attrs?.fileName) {
      parts.push(String(n.attrs.fileName));
    }
    if (n.type === 'mediaImage' && n.attrs?.caption) {
      parts.push(String(n.attrs.caption));
    }
    if (n.type === 'terminalBlock') {
      if (n.attrs?.title) parts.push(String(n.attrs.title));
      if (Array.isArray(n.attrs?.entries)) {
        for (const entry of n.attrs.entries as Array<{ command?: string; output?: string }>) {
          if (entry.command) parts.push(`\n${entry.command}`);
          if (entry.output) parts.push(`\n${entry.output}`);
        }
      }
      parts.push('\n');
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child);
      }
      if (
        n.type === 'paragraph' ||
        n.type === 'heading' ||
        n.type === 'blockquote' ||
        n.type === 'listItem' ||
        n.type === 'taskItem' ||
        n.type === 'codeBlock'
      ) {
        parts.push('\n');
      }
    }
  };

  walk(node);
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractTaskStats(node: JSONContent | undefined | null): { total: number; completed: number } {
  let total = 0;
  let completed = 0;

  const walk = (n: JSONContent) => {
    if (n.type === 'taskItem') {
      total += 1;
      if (n.attrs?.checked) {
        completed += 1;
      }
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child);
      }
    }
  };

  if (node) walk(node);
  return { total, completed };
}

export function countWords(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).length;
}

export function getPreviewSnippet(plainText: string, maxLength = 140): string {
  const singleLine = plainText.replace(/\s+/g, ' ').trim();
  if (!singleLine) return 'Empty document';
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength).trim()}...`;
}

export function noteToMarkdown(note: Note): string {
  const lines: string[] = [];
  lines.push(`# ${note.title || 'Untitled'}`);
  if (note.journalDate) {
    lines.push(`Date: ${note.journalDate}`);
  }
  if (note.tags.length > 0) {
    lines.push(`Tags: ${note.tags.map((t) => `#${t}`).join(' ')}`);
  }
  lines.push('');

  const serializeNode = (node: JSONContent, indent = ''): string => {
    if (!node) return '';
    const childrenText = () =>
      (node.content || []).map((c) => serializeNode(c, indent)).join('');

    switch (node.type) {
      case 'doc':
        return (node.content || []).map((c) => serializeNode(c)).join('\n\n');
      case 'paragraph':
        return childrenText();
      case 'heading': {
        const level = Number(node.attrs?.level || 1);
        return `${'#'.repeat(level)} ${childrenText()}`;
      }
      case 'text': {
        let txt = node.text || '';
        for (const mark of node.marks || []) {
          if (mark.type === 'bold') txt = `**${txt}**`;
          else if (mark.type === 'italic') txt = `*${txt}*`;
          else if (mark.type === 'strike') txt = `~~${txt}~~`;
          else if (mark.type === 'code') txt = `\`${txt}\``;
          else if (mark.type === 'link') txt = `[${txt}](${mark.attrs?.href || ''})`;
        }
        return txt;
      }
      case 'bulletList':
        return (node.content || [])
          .map((item) => `${indent}- ${serializeNode(item, indent + '  ')}`)
          .join('\n');
      case 'orderedList':
        return (node.content || [])
          .map((item, idx) => `${indent}${idx + 1}. ${serializeNode(item, indent + '  ')}`)
          .join('\n');
      case 'listItem':
        return (node.content || []).map((c) => serializeNode(c, indent)).join('\n');
      case 'taskList':
        return (node.content || [])
          .map((item) => serializeNode(item, indent))
          .join('\n');
      case 'taskItem': {
        const checked = Boolean(node.attrs?.checked);
        const body = (node.content || []).map((c) => serializeNode(c, indent)).join(' ');
        return `${indent}- [${checked ? 'x' : ' '}] ${body}`;
      }
      case 'blockquote':
        return (node.content || [])
          .map((c) => `> ${serializeNode(c)}`)
          .join('\n');
      case 'callout': {
        const emoji = node.attrs?.emoji || '💡';
        return (node.content || [])
          .map((c) => `> ${emoji} ${serializeNode(c)}`)
          .join('\n');
      }
      case 'codeBlock':
        return `\`\`\`\n${childrenText()}\n\`\`\``;
      case 'horizontalRule':
        return '---';
      case 'mediaImage':
        return `![${node.attrs?.caption || 'Image'}](${node.attrs?.src || node.attrs?.mediaId || ''})`;
      case 'audioBlock':
        return `[Audio: ${node.attrs?.title || 'Audio track'}]`;
      case 'videoBlock':
        return `[Video: ${node.attrs?.src || 'Embedded video'}]`;
      case 'fileAttachment':
        return `[Attachment: ${node.attrs?.fileName || 'File'}]`;
      case 'terminalBlock': {
        const prompt = String(node.attrs?.prompt || '$');
        const entries = Array.isArray(node.attrs?.entries)
          ? (node.attrs.entries as Array<{ command?: string; output?: string }>)
          : [];
        const body = entries
          .map((e) => `${prompt} ${e.command || ''}${e.output ? `\n${e.output}` : ''}`)
          .join('\n');
        return `\`\`\`bash\n${body}\n\`\`\``;
      }
      default:
        return childrenText();
    }
  };

  lines.push(serializeNode(note.content));
  return lines.join('\n');
}

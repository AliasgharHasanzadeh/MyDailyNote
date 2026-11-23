import { inlineStyleBlocksIntoDocument, sanitizeSafeInlineStyle } from './safeCss';

const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'applet',
  'base',
  'meta',
  'link',
  'noscript',
]);

const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster']);

export function isSafeHttpOrImageUrl(raw: string, allowRelative = false): boolean {
  const val = raw.trim();
  if (!val) return false;
  if (allowRelative && (val.startsWith('#') || val.startsWith('/'))) return true;
  const normalized = val.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return true;
  if (normalized.startsWith('mailto:') || normalized.startsWith('tel:')) return true;
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(normalized)) return true;
  return false;
}

export function sanitizeHtmlForEditor(rawHtml: string): string {
  if (!rawHtml.trim() || typeof DOMParser === 'undefined') return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  // Inline safe CSS declarations from any <style> tags (both doc.head and doc.body)
  // onto matched elements before stripping <style> tags for host editor safety.
  inlineStyleBlocksIntoDocument(doc);

  const cleanElement = (root: Element) => {
    const children = Array.from(root.children);
    for (const el of children) {
      const tag = el.tagName.toLowerCase();
      if (BLOCKED_TAGS.has(tag)) {
        el.remove();
        continue;
      }

      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc') {
          el.removeAttribute(attr.name);
          continue;
        }
        if (URL_ATTRS.has(name) && !isSafeHttpOrImageUrl(attr.value, name === 'href')) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (name === 'style') {
          const safeStyle = sanitizeSafeInlineStyle(attr.value);
          if (safeStyle) {
            el.setAttribute('style', safeStyle);
          } else {
            el.removeAttribute('style');
          }
        }
      }

      // Normalize legacy <font> tags to <span> so TipTap preserves their inline styles
      if (tag === 'font') {
        const span = doc.createElement('span');
        const safeStyle = sanitizeSafeInlineStyle(el.getAttribute('style'));
        if (safeStyle) span.setAttribute('style', safeStyle);
        while (el.firstChild) {
          span.appendChild(el.firstChild);
        }
        el.replaceWith(span);
        cleanElement(span);
        continue;
      }

      cleanElement(el);
    }
  };

  cleanElement(doc.body);
  return doc.body.innerHTML;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(raw: string): string {
  // Extract inline code first so markdown inside code spans is untouched
  const tokens: string[] = [];
  let working = raw.replace(/`([^`]+)`/g, (_m, code: string) => {
    const idx = tokens.length;
    tokens.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000CODE_${idx}\u0000`;
  });

  working = escapeHtml(working);

  // Images: ![alt](url)
  working = working.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    if (!isSafeHttpOrImageUrl(url, false)) return escapeHtml(alt);
    return `<img src="${escapeHtml(url)}" alt="${alt}" />`;
  });

  // Links: [text](url)
  working = working.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    if (!isSafeHttpOrImageUrl(url, true)) return label;
    return `<a href="${escapeHtml(url)}">${label}</a>`;
  });

  // Bold, Italic, Strike
  working = working.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  working = working.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  working = working.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  working = working.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  return working.replace(/\u0000CODE_(\d+)\u0000/g, (_m, idxStr: string) => {
    return tokens[Number(idxStr)] || '';
  });
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

export function markdownToSafeHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push('<hr />');
      i += 1;
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // GFM Table
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isMarkdownTableSeparator(lines[i + 1])
    ) {
      const headers = splitMarkdownTableRow(trimmed);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        bodyRows.push(splitMarkdownTableRow(lines[i]));
        i += 1;
      }
      const thead = `<thead><tr>${headers
        .map((h) => `<th>${renderInlineMarkdown(h)}</th>`)
        .join('')}</tr></thead>`;
      const tbody =
        bodyRows.length > 0
          ? `<tbody>${bodyRows
              .map(
                (row) =>
                  `<tr>${headers
                    .map((_, colIdx) => `<td>${renderInlineMarkdown(row[colIdx] || '')}</td>`)
                    .join('')}</tr>`
              )
              .join('')}</tbody>`
          : '';
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote><p>${renderInlineMarkdown(quoteLines.join(' '))}</p></blockquote>`);
      continue;
    }

    // Task List (- [ ] or - [x])
    if (/^[-*]\s+\[[ xX]\]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+\[[ xX]\]\s+/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (m) {
          const checked = m[1].toLowerCase() === 'x';
          items.push(
            `<li data-type="taskItem" data-checked="${checked ? 'true' : 'false'}"><p>${renderInlineMarkdown(
              m[2]
            )}</p></li>`
          );
        }
        i += 1;
      }
      out.push(`<ul data-type="taskList">${items.join('')}</ul>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const text = lines[i].trim().replace(/^[-*+]\s+/, '');
        items.push(`<li><p>${renderInlineMarkdown(text)}</p></li>`);
        i += 1;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const text = lines[i].trim().replace(/^\d+\.\s+/, '');
        items.push(`<li><p>${renderInlineMarkdown(text)}</p></li>`);
        i += 1;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Paragraph (gather contiguous plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('```') &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    out.push(`<p>${renderInlineMarkdown(paraLines.join(' '))}</p>`);
  }

  return out.join('');
}

export function detectMarkupKind(input: string): 'html' | 'markdown' {
  const trimmed = input.trim();
  if (
    /<(style|table|tr|td|th|p|div|span|section|article|aside|header|h[1-6]|ul|ol|li|img|a|blockquote|pre|code|strong|em|mark|font)\b/i.test(
      trimmed
    )
  ) {
    return 'html';
  }
  return 'markdown';
}

export function convertMarkupToSafeEditorHtml(
  input: string,
  mode: 'auto' | 'html' | 'markdown'
): string {
  const resolved = mode === 'auto' ? detectMarkupKind(input) : mode;
  if (resolved === 'html') {
    return sanitizeHtmlForEditor(input);
  }
  return sanitizeHtmlForEditor(markdownToSafeHtml(input));
}

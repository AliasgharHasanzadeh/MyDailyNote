import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import {
  Check,
  Code2,
  Columns2,
  Copy,
  Eye,
  FileCode2,
  Trash2,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

type HtmlViewMode = 'split' | 'preview' | 'code';
type HtmlDirMode = 'auto' | 'rtl' | 'ltr';

const HTML_TEMPLATES: ReadonlyArray<{ id: string; label: string; html: string }> = [
  {
    id: 'table',
    label: 'Table (tr/td)',
    html: `<table>
  <thead>
    <tr>
      <th>Service</th>
      <th>Port</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>HTTPS Gateway</td>
      <td>443</td>
      <td><span class="badge ok">Active</span></td>
    </tr>
    <tr>
      <td>SSH Bastion</td>
      <td>22</td>
      <td><span class="badge warn">Restricted</span></td>
    </tr>
  </tbody>
</table>`,
  },
  {
    id: 'rtl_table',
    label: 'جدول فارسی',
    html: `<div dir="rtl">
  <table>
    <thead>
      <tr>
        <th>عنوان تسک</th>
        <th>مسئول</th>
        <th>وضعیت</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>تنظیم فایروال و قوانین شبکه</td>
        <td>تیم امنیت</td>
        <td><span class="badge ok">تکمیل شده</span></td>
      </tr>
      <tr>
        <td>بررسی لاگ‌های سرور</td>
        <td>واحد عملیات</td>
        <td><span class="badge warn">در حال انجام</span></td>
      </tr>
    </tbody>
  </table>
</div>`,
  },
  {
    id: 'cards',
    label: 'Grid Cards',
    html: `<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .card { padding: 12px; border-radius: 10px; border: 1px solid var(--v-border); background: var(--v-secondary); }
  .label { font-size: 11px; color: var(--v-muted); margin-bottom: 4px; }
  .value { font-size: 18px; font-weight: 700; color: var(--v-accent); }
</style>
<div class="grid">
  <div class="card">
    <div class="label">Uptime</div>
    <div class="value">99.98%</div>
  </div>
  <div class="card">
    <div class="label">Active Nodes</div>
    <div class="value">12</div>
  </div>
  <div class="card">
    <div class="label">Latency</div>
    <div class="value">14 ms</div>
  </div>
</div>`,
  },
];

const BLOCKED_TAGS = new Set([
  'script',
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

function isSafeEmbedUrl(raw: string): boolean {
  const val = raw.trim();
  if (!val) return true;
  if (val.startsWith('#') || val.startsWith('/')) return true;
  const lower = val.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return true;
  if (lower.startsWith('mailto:') || lower.startsWith('tel:')) return true;
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(lower)) return true;
  return false;
}

function sanitizeStyleBlock(css: string): string {
  return css
    .replace(/<\/style/gi, '/* blocked */')
    .replace(/@import\b[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '/* blocked */(')
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/vbscript\s*:/gi, 'blocked:')
    .replace(/behavior\s*:/gi, '/* blocked */:')
    .replace(/-moz-binding\s*:/gi, '/* blocked */:');
}

function sanitizeUserHtmlParts(rawHtml: string): {
  headStyles: string;
  bodyStyle: string;
  bodyHtml: string;
  htmlDir: string | null;
} {
  if (!rawHtml.trim() || typeof DOMParser === 'undefined') {
    return { headStyles: '', bodyStyle: '', bodyHtml: '', htmlDir: null };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  const cleanNode = (root: Element) => {
    const children = Array.from(root.children);
    for (const el of children) {
      const tag = el.tagName.toLowerCase();
      if (BLOCKED_TAGS.has(tag)) {
        el.remove();
        continue;
      }

      if (tag === 'style') {
        el.textContent = sanitizeStyleBlock(el.textContent || '');
      }

      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc') {
          el.removeAttribute(attr.name);
          continue;
        }
        if (name === 'style') {
          el.setAttribute('style', sanitizeStyleBlock(attr.value));
          continue;
        }
        if (URL_ATTRS.has(name) && !isSafeEmbedUrl(attr.value)) {
          el.removeAttribute(attr.name);
        }
      }

      cleanNode(el);
    }
  };

  // HTML5 DOMParser places leading or <head>-wrapped <style> tags into doc.head.
  // Collect and sanitize all <style> elements from doc.head so user CSS is never dropped.
  const headStyleBlocks: string[] = [];
  if (doc.head) {
    for (const styleEl of Array.from(doc.head.querySelectorAll('style'))) {
      const cleanedCss = sanitizeStyleBlock(styleEl.textContent || '').trim();
      if (cleanedCss) {
        headStyleBlocks.push(`<style>\n${cleanedCss}\n</style>`);
      }
    }
  }

  const rawHtmlDir = doc.documentElement.getAttribute('dir')?.trim().toLowerCase();
  const htmlDir =
    rawHtmlDir === 'rtl' || rawHtmlDir === 'ltr' || rawHtmlDir === 'auto' ? rawHtmlDir : null;

  const rawBodyStyle = doc.body.getAttribute('style');
  const bodyStyle = rawBodyStyle ? sanitizeStyleBlock(rawBodyStyle).trim() : '';

  cleanNode(doc.body);

  return {
    headStyles: headStyleBlocks.join('\n'),
    bodyStyle,
    bodyHtml: doc.body.innerHTML,
    htmlDir,
  };
}

export function sanitizeUserHtml(rawHtml: string): string {
  const parts = sanitizeUserHtmlParts(rawHtml);
  return `${parts.headStyles}${parts.bodyHtml}`;
}

function readThemePaletteFromDom() {
  if (typeof window === 'undefined') {
    return {
      bg: '#151622',
      secondary: '#1c1d2b',
      text: '#f4f4f7',
      muted: '#9293a5',
      accent: '#8b7cff',
      border: 'rgba(244, 244, 247, 0.14)',
    };
  }
  const styles = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  return {
    bg: pick('--bg-surface', '#151622'),
    secondary: pick('--bg-secondary', '#1c1d2b'),
    text: pick('--text-primary', '#f4f4f7'),
    muted: pick('--text-secondary', '#9293a5'),
    accent: pick('--accent', '#8b7cff'),
    border: pick('--border-strong', 'rgba(148, 163, 184, 0.25)'),
  };
}

function HtmlBlockView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const html = (node.attrs.html as string) ?? HTML_TEMPLATES[0].html;
  const title = (node.attrs.title as string) || 'HTML Block';
  const mode = ((node.attrs.mode as HtmlViewMode) || 'split') as HtmlViewMode;
  const dirMode = ((node.attrs.dirMode as HtmlDirMode) || 'auto') as HtmlDirMode;

  const blockId = useId();
  const [localHtml, setLocalHtml] = useState(html);
  const localHtmlRef = useRef(localHtml);
  localHtmlRef.current = localHtml;
  const lastCommittedHtmlRef = useRef(html);
  const syncTimerRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [iframeHeight, setIframeHeight] = useState(140);
  const [copied, setCopied] = useState(false);
  const [paletteVersion, setPaletteVersion] = useState(0);

  // Sync external attribute updates (e.g. undo/redo) without disrupting active cursor position
  useEffect(() => {
    if (html !== lastCommittedHtmlRef.current) {
      lastCommittedHtmlRef.current = html;
      setLocalHtml(html);
    }
  }, [html]);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  const commitHtmlChange = (nextHtml: string, immediate = false) => {
    setLocalHtml(nextHtml);
    localHtmlRef.current = nextHtml;
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (immediate) {
      lastCommittedHtmlRef.current = nextHtml;
      updateAttributes({ html: nextHtml });
      return;
    }
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      lastCommittedHtmlRef.current = nextHtml;
      updateAttributes({ html: nextHtml });
    }, 180);
  };

  const flushPendingHtml = () => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
      const latest = localHtmlRef.current;
      if (latest !== lastCommittedHtmlRef.current) {
        lastCommittedHtmlRef.current = latest;
        updateAttributes({ html: latest });
      }
    }
  };

  // Refresh iframe base CSS whenever <html> theme classes/attributes change
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setPaletteVersion((v) => v + 1);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; blockId?: string; height?: number } | null;
      if (
        data &&
        data.source === 'vellum-html-block' &&
        data.blockId === blockId &&
        typeof data.height === 'number' &&
        Number.isFinite(data.height)
      ) {
        const clamped = Math.max(36, Math.min(2200, Math.ceil(data.height)));
        setIframeHeight(clamped);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [blockId]);

  const sanitizedParts = useMemo(() => sanitizeUserHtmlParts(localHtml), [localHtml]);

  const srcDoc = useMemo(() => {
    void paletteVersion;
    const p = readThemePaletteFromDom();
    const dirAttr =
      dirMode === 'rtl'
        ? 'rtl'
        : dirMode === 'ltr'
          ? 'ltr'
          : sanitizedParts.htmlDir || 'auto';
    const hasContent = Boolean(sanitizedParts.bodyHtml.trim() || sanitizedParts.headStyles.trim());
    return `<!doctype html>
<html dir="${dirAttr}">
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Vazirmatn:wght@400;500;600;700&display=swap" />
<style>
  :root {
    --v-bg: ${p.bg};
    --v-secondary: ${p.secondary};
    --v-text: ${p.text};
    --v-muted: ${p.muted};
    --v-accent: ${p.accent};
    --v-border: ${p.border};
  }
  @layer vellum-base {
    *, *::before, *::after { box-sizing: border-box; }
    html {
      margin: 0;
      padding: 0;
      height: auto;
      min-height: 0;
      background: transparent;
      overflow-y: hidden;
    }
    body {
      margin: 0;
      padding: 12px;
      height: auto;
      min-height: 0;
      display: flow-root;
      background: transparent;
      color: var(--v-text);
      font-family: 'Plus Jakarta Sans', 'Vazirmatn', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13.5px;
      line-height: 1.6;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--v-border);
      border-radius: 8px;
      overflow: hidden;
      font-size: 13px;
    }
    th, td {
      padding: 8px 11px;
      border: 1px solid var(--v-border);
      text-align: start;
      vertical-align: top;
    }
    th {
      background: var(--v-secondary);
      font-weight: 600;
      color: var(--v-text);
    }
    tr:nth-child(even) td {
      background: color-mix(in srgb, var(--v-secondary) 45%, transparent);
    }
    a { color: var(--v-accent); }
    code {
      font-family: 'JetBrains Mono', monospace;
      background: var(--v-secondary);
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 0.88em;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge.ok { background: rgba(16, 185, 129, 0.16); color: #10b981; }
    .badge.warn { background: rgba(245, 158, 11, 0.16); color: #f59e0b; }
    .badge.err { background: rgba(239, 68, 68, 0.16); color: #ef4444; }
  }
</style>
${sanitizedParts.bodyStyle ? `<style>body { ${sanitizedParts.bodyStyle} }</style>` : ''}
${sanitizedParts.headStyles}
</head>
<body>
${hasContent ? sanitizedParts.bodyHtml : '<div style="color:var(--v-muted);font-size:12px;">Empty HTML block — add HTML tags like &lt;table&gt;, &lt;tr&gt;, &lt;td&gt; to preview.</div>'}
<script>
  (function () {
    var id = ${JSON.stringify(blockId)};
    var lastSent = 0;
    function postHeight() {
      var body = document.body;
      if (!body) return;
      var rectHeight = body.getBoundingClientRect().height;
      var h = Math.ceil(Math.max(body.scrollHeight, body.offsetHeight, rectHeight));
      if (h > 0 && h !== lastSent) {
        lastSent = h;
        window.parent.postMessage({ source: 'vellum-html-block', blockId: id, height: h }, '*');
      }
    }
    postHeight();
    setTimeout(postHeight, 80);
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(postHeight).observe(document.body);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(postHeight);
    }
    window.addEventListener('load', postHeight);
  })();
</script>
</body>
</html>`;
  }, [sanitizedParts, dirMode, blockId, paletteVersion]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(localHtmlRef.current);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore clipboard limitations
    }
  };

  return (
    <NodeViewWrapper
      dir="ltr"
      data-type="htmlBlock"
      className={`group my-4 overflow-hidden rounded-xl border bg-[var(--bg-surface)] transition-shadow ${
        selected
          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/25'
          : 'border-[var(--border-subtle)]'
      }`}
    >
      {/* Top Bar */}
      <div
        contentEditable={false}
        className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2 select-none"
      >
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          <input
            type="text"
            value={title}
            onChange={(e) => updateAttributes({ title: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="HTML block title"
            className="min-w-0 w-32 sm:w-44 bg-transparent text-xs font-semibold text-[var(--text-primary)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Direction */}
          <button
            type="button"
            onClick={() => {
              flushPendingHtml();
              const next: HtmlDirMode =
                dirMode === 'auto' ? 'rtl' : dirMode === 'rtl' ? 'ltr' : 'auto';
              updateAttributes({ dirMode: next });
            }}
            title="Switch HTML preview text direction (Auto / RTL / LTR)"
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {dirMode.toUpperCase()}
          </button>

          {/* View Mode */}
          <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5">
            <button
              type="button"
              onClick={() => {
                flushPendingHtml();
                updateAttributes({ mode: 'split' });
              }}
              title="Split code & preview"
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium cursor-pointer ${
                mode === 'split'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Columns2 className="h-3 w-3" />
              <span className="hidden sm:inline">Split</span>
            </button>
            <button
              type="button"
              onClick={() => {
                flushPendingHtml();
                updateAttributes({ mode: 'preview' });
              }}
              title="Preview only"
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium cursor-pointer ${
                mode === 'preview'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Eye className="h-3 w-3" />
              <span className="hidden sm:inline">Preview</span>
            </button>
            <button
              type="button"
              onClick={() => {
                flushPendingHtml();
                updateAttributes({ mode: 'code' });
              }}
              title="HTML code only"
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium cursor-pointer ${
                mode === 'code'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Code2 className="h-3 w-3" />
              <span className="hidden sm:inline">HTML</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            title="Copy HTML code"
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={deleteNode}
            title="Remove HTML block"
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Starter Templates bar (shown when editing code) */}
      {mode !== 'preview' && (
        <div
          contentEditable={false}
          className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 px-3.5 py-1.5 text-[11px]"
        >
          <span className="text-[var(--text-muted)] mr-1">Templates:</span>
          {HTML_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => commitHtmlChange(tpl.html, true)}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)] cursor-pointer"
            >
              {tpl.label}
            </button>
          ))}
        </div>
      )}

      {/* Editor + Sandboxed Preview Panes */}
      <div
        contentEditable={false}
        className={`grid ${
          mode === 'split' ? 'grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]' : 'grid-cols-1'
        }`}
      >
        {mode !== 'preview' && (
          <div className="bg-[var(--bg-canvas)]">
            <textarea
              ref={textareaRef}
              value={localHtml}
              onChange={(e) => commitHtmlChange(e.target.value)}
              onBlur={flushPendingHtml}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const start = el.selectionStart;
                  const end = el.selectionEnd;
                  const next =
                    localHtml.slice(0, start) + '  ' + localHtml.slice(end);
                  commitHtmlChange(next);
                  requestAnimationFrame(() => {
                    if (textareaRef.current) {
                      textareaRef.current.selectionStart = start + 2;
                      textareaRef.current.selectionEnd = start + 2;
                    }
                  });
                }
              }}
              spellCheck={false}
              rows={Math.min(18, Math.max(6, localHtml.split('\n').length + 1))}
              placeholder="<table><tr><th>Column</th></tr><tr><td>Value</td></tr></table>"
              className="block h-full min-h-[160px] w-full resize-y bg-transparent p-3 font-mono text-[12px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>
        )}

        {mode !== 'code' && (
          <div className="bg-[var(--bg-surface)]">
            <iframe
              title={title}
              sandbox="allow-scripts"
              srcDoc={srcDoc}
              style={{ height: `${iframeHeight}px` }}
              className="block w-full border-0 bg-transparent"
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const HtmlBlockNode = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      title: { default: 'HTML Block' },
      html: { default: HTML_TEMPLATES[0].html },
      mode: { default: 'split' },
      dirMode: { default: 'auto' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="htmlBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'htmlBlock' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HtmlBlockView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        if (!target) return false;
        const tag = target.tagName;
        return (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          tag === 'BUTTON' ||
          Boolean(target.closest('button, input, textarea, select'))
        );
      },
      ignoreMutation: () => true,
    });
  },
});

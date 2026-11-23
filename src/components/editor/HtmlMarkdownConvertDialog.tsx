import { FileCode, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { convertMarkupToSafeEditorHtml, detectMarkupKind } from '../../utils/htmlMarkdownImport';

type ConvertMode = 'auto' | 'html' | 'markdown';

interface HtmlMarkdownConvertDialogProps {
  onClose: () => void;
  onConvertAndInsert: (safeHtml: string) => void;
}

const PRESETS: ReadonlyArray<{ id: string; label: string; mode: ConvertMode; content: string }> = [
  {
    id: 'html_table_img',
    label: 'HTML Table + Image',
    mode: 'html',
    content: `<table>
  <tr>
    <th>Preview</th>
    <th>Item</th>
    <th>Notes</th>
  </tr>
  <tr>
    <td><img src="https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=400&q=80" alt="Code" /></td>
    <td><strong>Project Architecture</strong></td>
    <td>Native editable cell — click to type or drop another image inside.</td>
  </tr>
</table>`,
  },
  {
    id: 'rtl_table',
    label: 'جدول فارسی',
    mode: 'html',
    content: `<table>
  <tr>
    <th>عنوان</th>
    <th>توضیحات</th>
    <th>وضعیت</th>
  </tr>
  <tr>
    <td>بخش اول</td>
    <td>متن فارسی مستقیم داخل صفحه و قابل ویرایش</td>
    <td>تکمیل شده</td>
  </tr>
</table>`,
  },
  {
    id: 'markdown_sample',
    label: 'Markdown + Table',
    mode: 'markdown',
    content: `## Weekly Plan

- [x] Design native table cells
- [ ] Add images inside cells

| Feature | Format | Support |
| --- | --- | --- |
| Tables | HTML / Markdown | Native editable |
| Images | \`<img>\` inside \`<td>\` | Full zoom & caption |`,
  },
];

export function HtmlMarkdownConvertDialog({
  onClose,
  onConvertAndInsert,
}: HtmlMarkdownConvertDialogProps) {
  const [mode, setMode] = useState<ConvertMode>('auto');
  const [input, setInput] = useState(PRESETS[0].content);
  const [error, setError] = useState<string | null>(null);

  const detected = detectMarkupKind(input);
  const activeLabel =
    mode === 'auto' ? `Auto (${detected === 'html' ? 'HTML' : 'Markdown'})` : mode.toUpperCase();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) {
      setError('Paste or write HTML or Markdown first.');
      return;
    }
    const safeHtml = convertMarkupToSafeEditorHtml(input, mode);
    if (!safeHtml.trim()) {
      setError('No convertible HTML or Markdown content found.');
      return;
    }
    onConvertAndInsert(safeHtml);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-popover)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <FileCode className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Convert HTML / Markdown to Page Content
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Converts markup directly into seamless, editable text, tables, and images inside your note
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-secondary)] p-0.5">
              {(['auto', 'html', 'markdown'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setMode(opt)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    mode === opt
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {opt === 'auto' ? 'Auto' : opt === 'html' ? 'HTML' : 'Markdown'}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[var(--text-muted)]">Examples:</span>
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setMode(preset.mode);
                    setInput(preset.content);
                    setError(null);
                  }}
                  className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            dir="ltr"
            spellCheck={false}
            rows={11}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Paste HTML (e.g. <table><tr><td>...</td><td><img src='...' /></td></tr></table>) or Markdown..."
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 font-mono text-xs leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
            <span>Mode: {activeLabel}</span>
            <span>Supports native &lt;table&gt;, &lt;tr&gt;, &lt;td&gt;, &lt;img&gt;, headings, lists & links</span>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border-subtle)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Convert & Insert into Page
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

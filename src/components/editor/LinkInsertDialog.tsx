import { Link2, X } from 'lucide-react';
import { useState } from 'react';

interface LinkInsertDialogProps {
  initialText?: string;
  initialUrl?: string;
  onClose: () => void;
  onInsert: (url: string, label: string) => void;
}

export function LinkInsertDialog({
  initialText = '',
  initialUrl = '',
  onClose,
  onInsert,
}: LinkInsertDialogProps) {
  const [url, setUrl] = useState(initialUrl);
  const [label, setLabel] = useState(initialText);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError('Please enter a valid URL.');
      return;
    }

    const normalizedUrl = /^(https?:\/\/|mailto:|tel:|\/)/i.test(trimmedUrl)
      ? trimmedUrl
      : `https://${trimmedUrl}`;

    onInsert(normalizedUrl, label.trim() || normalizedUrl);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-popover)]"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <Link2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Add Link
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Insert a clickable web link or reference URL
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              URL
            </label>
            <input
              type="text"
              autoFocus
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Link Text <span className="text-[var(--text-muted)]">(optional)</span>
            </label>
            <input
              type="text"
              dir="auto"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Documentation, GitHub repo, reference..."
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
            />
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
              className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
            >
              Insert Link
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

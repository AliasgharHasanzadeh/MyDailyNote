import type { Editor } from '@tiptap/react';
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface LinkHoverPopoverProps {
  editor: Editor | null;
}

interface HoveredLinkState {
  href: string;
  top: number;
  left: number;
}

export function LinkHoverPopover({ editor }: LinkHoverPopoverProps) {
  const [hovered, setHovered] = useState<HoveredLinkState | null>(null);
  const [copied, setCopied] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = (delayMs = 200) => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setHovered(null);
      setCopied(false);
    }, delayMs);
  };

  useEffect(() => {
    if (!editor) return;
    let dom: HTMLElement | null = null;
    try {
      dom = editor.view.dom;
    } catch {
      return;
    }

    const showForAnchor = (anchor: HTMLAnchorElement) => {
      const href = anchor.getAttribute('href') || anchor.href;
      if (!href) return;
      clearCloseTimer();

      const rect = anchor.getBoundingClientRect();
      const showAbove = rect.bottom + 54 > window.innerHeight && rect.top > 56;
      const top = showAbove ? rect.top - 42 : rect.bottom + 6;
      const left = Math.max(12, Math.min(window.innerWidth - 332, rect.left));

      setHovered((prev) => {
        if (!prev || prev.href !== href) {
          setCopied(false);
        }
        return { href, top, left };
      });
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest('a') as HTMLAnchorElement | null;
      if (anchor && dom?.contains(anchor)) {
        showForAnchor(anchor);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const related = e.relatedTarget as Node | null;
      if (related && (anchor.contains(related) || popoverRef.current?.contains(related))) {
        return;
      }
      scheduleClose(220);
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest('a') as HTMLAnchorElement | null;
      if (anchor && dom?.contains(anchor)) {
        showForAnchor(anchor);
      } else if (!popoverRef.current?.contains(target)) {
        setHovered(null);
      }
    };

    dom.addEventListener('mouseover', handleMouseOver);
    dom.addEventListener('mouseout', handleMouseOut);
    dom.addEventListener('click', handleClick);

    return () => {
      clearCloseTimer();
      dom?.removeEventListener('mouseover', handleMouseOver);
      dom?.removeEventListener('mouseout', handleMouseOut);
      dom?.removeEventListener('click', handleClick);
    };
  }, [editor]);

  if (!hovered) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(hovered.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback copy for restricted contexts
      const textarea = document.createElement('textarea');
      textarea.value = hovered.href;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  return (
    <div
      ref={popoverRef}
      style={{ top: hovered.top, left: hovered.left }}
      onMouseEnter={clearCloseTimer}
      onMouseLeave={() => scheduleClose(180)}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-50 flex max-w-[min(320px,calc(100vw-24px))] items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 shadow-[var(--shadow-popover)]"
    >
      <Link2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
      <a
        href={hovered.href}
        target="_blank"
        rel="noopener noreferrer"
        dir="ltr"
        title={hovered.href}
        className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline"
      >
        {hovered.href}
      </a>
      <div className="flex shrink-0 items-center gap-1 border-l border-[var(--border-subtle)] pl-1.5">
        <button
          type="button"
          onClick={handleCopy}
          title="Copy URL"
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
            copied
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
        <a
          href={hovered.href}
          target="_blank"
          rel="noopener noreferrer"
          title="Open link in new tab"
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

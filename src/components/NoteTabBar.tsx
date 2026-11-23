import { Copy, FileText, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Note } from '../types/workspace';

interface NoteTabBarProps {
  tabs: Note[];
  activeNoteId: string | null;
  isEditorActive: boolean;
  leftSidebarCollapsed: boolean;
  onActivateTab: (noteId: string) => void;
  onCloseTab: (noteId: string) => void;
  onCloseOtherTabs: (noteId: string) => void;
  onCloseTabsToRight: (noteId: string) => void;
  onCloseAllTabs: () => void;
  onCreateNewTab: () => void;
  onDuplicateNote: (note: Note) => void;
  onReorderTabs: (draggedId: string, targetId: string) => void;
}

interface TabContextMenuState {
  noteId: string;
  x: number;
  y: number;
}

export function NoteTabBar({
  tabs,
  activeNoteId,
  isEditorActive,
  leftSidebarCollapsed,
  onActivateTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onCloseAllTabs,
  onCreateNewTab,
  onDuplicateNote,
  onReorderTabs,
}: NoteTabBarProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);

  // Smoothly keep the active tab visible when switching notes
  useEffect(() => {
    if (!isEditorActive || !activeNoteId) return;
    const el = tabRefs.current.get(activeNoteId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  }, [activeNoteId, isEditorActive, tabs.length]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  if (tabs.length === 0) return null;

  const contextTabIndex = contextMenu
    ? tabs.findIndex((t) => t.id === contextMenu.noteId)
    : -1;
  const contextTab = contextTabIndex >= 0 ? tabs[contextTabIndex] : null;
  const hasTabsToRight = contextTabIndex >= 0 && contextTabIndex < tabs.length - 1;

  return (
    <>
      <div
        role="tablist"
        aria-label="Open note tabs"
        className={`flex shrink-0 items-end gap-1 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/80 px-2 pt-1.5 select-none ${
          leftSidebarCollapsed ? 'lg:pl-13' : ''
        }`}
      >
        <div
          ref={scrollContainerRef}
          onWheel={(e) => {
            const el = scrollContainerRef.current;
            if (!el) return;
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
              el.scrollLeft += e.deltaY;
            }
          }}
          className="no-scrollbar flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto"
        >
          {tabs.map((tab, index) => {
            const isActive = isEditorActive && tab.id === activeNoteId;
            const nextTab = tabs[index + 1];
            const isNextActive = Boolean(nextTab && isEditorActive && nextTab.id === activeNoteId);
            const isDragTarget = dragOverTabId === tab.id && draggedTabId !== tab.id;
            const label = tab.title.trim() || 'Untitled';

            return (
              <div
                key={tab.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(tab.id, el);
                  else tabRefs.current.delete(tab.id);
                }}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                draggable
                onClick={() => onActivateTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onActivateTab(tab.id);
                  }
                }}
                onMouseDown={(e) => {
                  // Prevent browser middle-click auto-scroll circle
                  if (e.button === 1) e.preventDefault();
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onCloseTab(tab.id);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    noteId: tab.id,
                    x: Math.min(window.innerWidth - 204, Math.max(8, e.clientX)),
                    y: Math.min(window.innerHeight - 210, Math.max(8, e.clientY)),
                  });
                }}
                onDragStart={(e) => {
                  setDraggedTabId(tab.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/vellum-tab-id', tab.id);
                }}
                onDragOver={(e) => {
                  if (!draggedTabId && !e.dataTransfer.types.includes('text/vellum-tab-id')) {
                    return;
                  }
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverTabId !== tab.id) {
                    setDragOverTabId(tab.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverTabId === tab.id) {
                    setDragOverTabId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sourceId =
                    draggedTabId || e.dataTransfer.getData('text/vellum-tab-id');
                  setDraggedTabId(null);
                  setDragOverTabId(null);
                  if (sourceId && sourceId !== tab.id) {
                    onReorderTabs(sourceId, tab.id);
                  }
                }}
                onDragEnd={() => {
                  setDraggedTabId(null);
                  setDragOverTabId(null);
                }}
                title={label}
                className={`group relative flex h-8 min-w-[116px] max-w-[216px] shrink-0 items-center gap-1.5 rounded-t-[10px] px-2.5 text-xs transition-colors cursor-pointer ${
                  isActive
                    ? 'z-10 -mb-px border border-b-0 border-[var(--border-subtle)] bg-[var(--bg-canvas)] pb-px text-[var(--text-primary)] font-medium'
                    : 'mb-0.5 rounded-b-[6px] border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                } ${draggedTabId === tab.id ? 'opacity-50' : ''} ${
                  isDragTarget ? 'ring-1 ring-[var(--accent)] bg-[var(--accent-soft)]/50' : ''
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-2 top-0 h-[2px] rounded-full bg-[var(--accent)]"
                  />
                )}

                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[13px] leading-none">
                  {tab.icon || <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
                </span>

                <span dir="auto" className="min-w-0 flex-1 truncate text-start">
                  {label}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  title="Close tab"
                  aria-label={`Close ${label}`}
                  className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer ${
                    isActive
                      ? 'opacity-80 hover:opacity-100'
                      : 'opacity-70 sm:opacity-0 sm:group-hover:opacity-100'
                  }`}
                >
                  <X className="h-3 w-3" />
                </button>

                {/* Subtle vertical separator between adjacent inactive tabs (Chrome style) */}
                {!isActive && !isNextActive && index < tabs.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-0.5 top-2 bottom-2 w-px bg-[var(--border-subtle)] group-hover:opacity-0"
                  />
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onCreateNewTab}
          title="New note tab (Alt+N)"
          aria-label="Open new note tab"
          className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Chrome-style Tab Context Menu */}
      {contextMenu && contextTab && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 w-48 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-[var(--shadow-popover)]"
        >
          <button
            type="button"
            onClick={() => {
              onDuplicateNote(contextTab);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate in new tab
          </button>
          <div className="my-1 h-px bg-[var(--border-subtle)]" />
          <button
            type="button"
            onClick={() => {
              onCloseTab(contextTab.id);
              setContextMenu(null);
            }}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <span>Close tab</span>
            <X className="h-3 w-3 opacity-60" />
          </button>
          <button
            type="button"
            disabled={tabs.length <= 1}
            onClick={() => {
              onCloseOtherTabs(contextTab.id);
              setContextMenu(null);
            }}
            className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            Close other tabs
          </button>
          <button
            type="button"
            disabled={!hasTabsToRight}
            onClick={() => {
              onCloseTabsToRight(contextTab.id);
              setContextMenu(null);
            }}
            className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            Close tabs to the right
          </button>
          <button
            type="button"
            onClick={() => {
              onCloseAllTabs();
              setContextMenu(null);
            }}
            className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-500/10 cursor-pointer"
          >
            Close all tabs
          </button>
        </div>
      )}
    </>
  );
}

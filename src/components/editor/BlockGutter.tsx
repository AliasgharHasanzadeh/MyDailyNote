import type { Editor } from '@tiptap/react';
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BLOCK_COMMANDS } from './blockCommands';
import type { BlockCommandItem, MediaKind } from './blockCommands';

interface BlockGutterProps {
  editor: Editor | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onRequestMediaAtPos: (kind: MediaKind, insertPos: number) => void;
}

interface HoveredBlock {
  index: number;
  top: number;
  pos: number;
  endPos: number;
}

export function BlockGutter({ editor, containerRef, onRequestMediaAtPos }: BlockGutterProps) {
  const [hovered, setHovered] = useState<HoveredBlock | null>(null);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);
  const [dropLineTop, setDropLineTop] = useState<number | null>(null);
  const dropTargetIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !editor) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (insertMenuOpen || blockMenuOpen) return;
      const pm = container.querySelector('.ProseMirror');
      if (!pm) return;

      const children = Array.from(pm.children) as HTMLElement[];
      if (children.length === 0) return;

      const containerRect = container.getBoundingClientRect();
      const y = e.clientY;

      let matchedIndex = -1;
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        if (y >= rect.top - 6 && y <= rect.bottom + 6) {
          matchedIndex = i;
          break;
        }
      }

      if (matchedIndex === -1) return;

      const el = children[matchedIndex];
      const rect = el.getBoundingClientRect();
      const doc = editor.state.doc;
      if (matchedIndex >= doc.childCount) return;

      let pos = 0;
      for (let i = 0; i < matchedIndex; i++) {
        pos += doc.child(i).nodeSize;
      }
      const endPos = pos + doc.child(matchedIndex).nodeSize;

      setHovered({
        index: matchedIndex,
        top: rect.top - containerRect.top + 3,
        pos,
        endPos,
      });
    };

    container.addEventListener('mousemove', handleMouseMove);
    return () => container.removeEventListener('mousemove', handleMouseMove);
  }, [containerRef, editor, insertMenuOpen, blockMenuOpen]);

  // Drag & drop reordering across ProseMirror top-level blocks
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !editor || dragSourceIndex === null) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      const pm = container.querySelector('.ProseMirror');
      if (!pm) return;
      const children = Array.from(pm.children) as HTMLElement[];
      const containerRect = container.getBoundingClientRect();
      const y = e.clientY;

      let targetIdx = children.length;
      let lineTop = children.length > 0 ? children[children.length - 1].getBoundingClientRect().bottom - containerRect.top : 0;

      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (y < mid) {
          targetIdx = i;
          lineTop = rect.top - containerRect.top;
          break;
        }
      }
      dropTargetIndexRef.current = targetIdx;
      setDropLineTop(lineTop);
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const targetIdx = dropTargetIndexRef.current;
      if (targetIdx !== null && dragSourceIndex !== null) {
        moveBlock(dragSourceIndex, targetIdx);
      }
      setDragSourceIndex(null);
      setDropLineTop(null);
    };

    const handleDragEnd = () => {
      setDragSourceIndex(null);
      setDropLineTop(null);
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragend', handleDragEnd);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragend', handleDragEnd);
    };
  }, [containerRef, editor, dragSourceIndex]);

  const moveBlock = (fromIdx: number, toIdx: number) => {
    if (!editor) return;
    const { state, view } = editor;
    const doc = state.doc;
    if (fromIdx < 0 || fromIdx >= doc.childCount) return;

    let adjustedTo = toIdx;
    if (adjustedTo === fromIdx || adjustedTo === fromIdx + 1) return;

    const nodeToMove = doc.child(fromIdx);
    let fromStart = 0;
    for (let i = 0; i < fromIdx; i++) {
      fromStart += doc.child(i).nodeSize;
    }
    const fromEnd = fromStart + nodeToMove.nodeSize;

    const tr = state.tr;
    tr.delete(fromStart, fromEnd);

    // Recompute destination offset on modified doc
    const nextDoc = tr.doc;
    const clampedTarget = Math.max(
      0,
      Math.min(nextDoc.childCount, adjustedTo > fromIdx ? adjustedTo - 1 : adjustedTo)
    );
    let insertOffset = 0;
    for (let i = 0; i < clampedTarget; i++) {
      insertOffset += nextDoc.child(i).nodeSize;
    }
    tr.insert(insertOffset, nodeToMove);
    view.dispatch(tr);
  };

  const duplicateBlock = (idx: number) => {
    if (!editor) return;
    const { state, view } = editor;
    const doc = state.doc;
    if (idx < 0 || idx >= doc.childCount) return;
    const node = doc.child(idx);
    let endOffset = 0;
    for (let i = 0; i <= idx; i++) endOffset += doc.child(i).nodeSize;
    view.dispatch(state.tr.insert(endOffset, node.copy(node.content)));
    setBlockMenuOpen(false);
  };

  const deleteBlock = (idx: number) => {
    if (!editor) return;
    const { state, view } = editor;
    const doc = state.doc;
    if (idx < 0 || idx >= doc.childCount) return;
    let startOffset = 0;
    for (let i = 0; i < idx; i++) startOffset += doc.child(i).nodeSize;
    const endOffset = startOffset + doc.child(idx).nodeSize;
    view.dispatch(state.tr.delete(startOffset, endOffset));
    setBlockMenuOpen(false);
  };

  const insertAfterBlock = (cmd: BlockCommandItem) => {
    if (!editor || !hovered) return;
    const insertPos = hovered.endPos;
    setInsertMenuOpen(false);

    if (cmd.mediaKind) {
      onRequestMediaAtPos(cmd.mediaKind, insertPos);
      return;
    }

    // Insert an empty paragraph at endPos and convert/execute command inside it
    editor
      .chain()
      .focus()
      .insertContentAt(insertPos, { type: 'paragraph' })
      .setTextSelection(insertPos + 1)
      .run();
    cmd.execute(editor);
  };

  return (
    <>
      {dropLineTop !== null && (
        <div
          style={{ top: dropLineTop }}
          className="pointer-events-none absolute left-10 right-0 z-20 h-0.5 rounded-full bg-[var(--accent)]"
        />
      )}

      {hovered && (
        <div
          style={{ top: hovered.top }}
          className="absolute left-0 z-20 flex items-center gap-0.5 select-none"
        >
          <button
            type="button"
            onClick={() => {
              setBlockMenuOpen(false);
              setInsertMenuOpen((prev) => !prev);
            }}
            title="Insert block below"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            draggable
            onDragStart={() => {
              setInsertMenuOpen(false);
              setBlockMenuOpen(false);
              setDragSourceIndex(hovered.index);
            }}
            onClick={() => {
              setInsertMenuOpen(false);
              setBlockMenuOpen((prev) => !prev);
            }}
            title="Drag to reorder or click for block actions"
            className="flex h-6 w-5 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          {insertMenuOpen && (
            <div className="absolute left-0 top-7 z-40 w-64 max-h-72 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-[var(--shadow-popover)]">
              <div className="px-2 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                Insert below block
              </div>
              {BLOCK_COMMANDS.map((cmd) => {
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={() => insertAfterBlock(cmd)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate font-medium">{cmd.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {blockMenuOpen && (
            <div className="absolute left-6 top-7 z-40 w-44 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1 shadow-[var(--shadow-popover)]">
              <button
                type="button"
                onClick={() => {
                  moveBlock(hovered.index, Math.max(0, hovered.index - 1));
                  setBlockMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <ArrowUp className="h-3.5 w-3.5" />
                Move up
              </button>
              <button
                type="button"
                onClick={() => {
                  moveBlock(hovered.index, hovered.index + 2);
                  setBlockMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                Move down
              </button>
              <button
                type="button"
                onClick={() => duplicateBlock(hovered.index)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicate
              </button>
              <div className="my-1 h-px bg-[var(--border-subtle)]" />
              <button
                type="button"
                onClick={() => deleteBlock(hovered.index)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-500/10 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete block
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

const CALLOUT_EMOJIS = ['💡', '📌', '📝', '✨', '⚠️', '🧭', '🎯', '🌿', '🔍', '💬'];

function CalloutView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const emoji = (node.attrs.emoji as string) || '💡';

  return (
    <NodeViewWrapper
      className="group relative my-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3.5 transition-colors"
      data-type="callout"
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0 pt-0.5" contentEditable={false}>
          <button
            type="button"
            onClick={() => setPickerOpen((prev) => !prev)}
            title="Change callout icon"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-base hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            {emoji}
          </button>
          {pickerOpen && (
            <div className="absolute left-0 top-9 z-30 flex flex-wrap gap-1 w-44 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 shadow-[var(--shadow-popover)]">
              {CALLOUT_EMOJIS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    updateAttributes({ emoji: item });
                    setPickerOpen(false);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-sm hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <NodeViewContent className="callout-content [&>p]:m-0" />
        </div>
        <button
          type="button"
          contentEditable={false}
          onClick={deleteNode}
          title="Remove callout"
          className="opacity-0 group-hover:opacity-100 shrink-0 rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-red-500 transition-opacity cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </NodeViewWrapper>
  );
}

export const CalloutNode = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      emoji: {
        default: '💡',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

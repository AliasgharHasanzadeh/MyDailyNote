import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';

export type TextDirectionValue = 'rtl' | 'ltr' | 'auto';

const DIRECTION_NODE_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'callout',
];

const LIST_CONTAINER_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);
const LIST_ITEM_TYPES = new Set(['listItem', 'taskItem']);

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textDirection: {
      setTextDirection: (direction: TextDirectionValue) => ReturnType;
      toggleTextDirection: (direction: 'rtl' | 'ltr') => ReturnType;
    };
  }
}

export function getActiveBlockDirection(editor: Editor | null): 'rtl' | 'ltr' | null {
  if (!editor) return null;
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const node = $from.node(depth);
    if (DIRECTION_NODE_TYPES.includes(node.type.name)) {
      const dir = node.attrs?.dir;
      if (dir === 'rtl' || dir === 'ltr') {
        return dir;
      }
    }
  }
  return null;
}

export const TextDirectionExtension = Extension.create({
  name: 'textDirection',

  addGlobalAttributes() {
    return [
      {
        types: DIRECTION_NODE_TYPES,
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => {
              const explicit = element.getAttribute('data-explicit-dir');
              if (explicit === 'rtl' || explicit === 'ltr') return explicit;
              const attr = element.getAttribute('dir');
              return attr === 'rtl' || attr === 'ltr' ? attr : null;
            },
            renderHTML: (attributes) => {
              if (attributes.dir === 'rtl' || attributes.dir === 'ltr') {
                return {
                  dir: attributes.dir,
                  'data-explicit-dir': attributes.dir,
                };
              }
              return { dir: 'auto' };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextDirection:
        (direction: TextDirectionValue) =>
        ({ state, tr, dispatch }) => {
          const nextDir = direction === 'auto' ? null : direction;
          const { from, to, $from } = state.selection;
          let updated = false;
          const updatedPositions = new Set<number>();

          const applyDirAt = (pos: number, nodeAttrs: Record<string, unknown>) => {
            if (updatedPositions.has(pos)) return;
            updatedPositions.add(pos);
            if (nodeAttrs.dir !== nextDir) {
              tr.setNodeMarkup(pos, undefined, { ...nodeAttrs, dir: nextDir });
              updated = true;
            }
          };

          state.doc.nodesBetween(from, to, (node, pos) => {
            if (DIRECTION_NODE_TYPES.includes(node.type.name)) {
              applyDirAt(pos, node.attrs);
            }
          });

          // Ensure enclosing list item / list container / callout / quote aligns consistently
          for (let depth = $from.depth; depth >= 1; depth -= 1) {
            const ancestor = $from.node(depth);
            if (
              LIST_CONTAINER_TYPES.has(ancestor.type.name) ||
              LIST_ITEM_TYPES.has(ancestor.type.name) ||
              ancestor.type.name === 'blockquote' ||
              ancestor.type.name === 'callout'
            ) {
              const pos = $from.before(depth);
              applyDirAt(pos, ancestor.attrs);
            }
          }

          if (updated && dispatch) {
            dispatch(tr);
          }
          return updated;
        },

      toggleTextDirection:
        (direction: 'rtl' | 'ltr') =>
        ({ editor, commands }) => {
          const current = getActiveBlockDirection(editor);
          if (current === direction) {
            return commands.setTextDirection('auto');
          }
          return commands.setTextDirection(direction);
        },
    };
  },
});

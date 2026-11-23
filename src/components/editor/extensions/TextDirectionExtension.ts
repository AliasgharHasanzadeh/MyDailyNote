import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

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
  'tableCell',
  'tableHeader',
];

const LIST_CONTAINER_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);
const LIST_ITEM_TYPES = new Set(['listItem', 'taskItem']);

// Matches the first strong RTL (Arabic/Persian/Hebrew) or LTR (Latin) character
const RTL_CHAR_RE = /[\u0591-\u07FF\u200F\uFB1D-\uFDFD\uFE70-\uFEFC]/;
const LTR_CHAR_RE = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;

export function detectStrongDirection(text: string): 'rtl' | 'ltr' | null {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (RTL_CHAR_RE.test(ch)) return 'rtl';
    if (LTR_CHAR_RE.test(ch)) return 'ltr';
  }
  return null;
}

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

const autoDirectionPluginKey = new PluginKey('autoTextDirection');

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

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: autoDirectionPluginKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!DIRECTION_NODE_TYPES.includes(node.type.name)) {
                return true;
              }
              if (node.attrs?.dir === 'rtl' || node.attrs?.dir === 'ltr') {
                return true;
              }
              const detected = detectStrongDirection(node.textContent || '');
              if (detected) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    dir: detected,
                    'data-auto-dir': detected,
                  })
                );
              }
              return true;
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
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

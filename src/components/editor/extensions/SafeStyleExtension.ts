import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core';
import { sanitizeSafeInlineStyle } from '../../../utils/safeCss';
import { sanitizeCssColor } from './TextColorMark';

const STYLED_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'horizontalRule',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'styledBox',
];

export const SafeStyleExtension = Extension.create({
  name: 'safeStyle',

  addGlobalAttributes() {
    return [
      {
        types: STYLED_BLOCK_TYPES,
        attributes: {
          style: {
            default: null,
            parseHTML: (element) =>
              sanitizeSafeInlineStyle((element as HTMLElement).getAttribute('style')),
            renderHTML: (attributes) => {
              const safe = sanitizeSafeInlineStyle(attributes.style as string | null);
              return safe ? { style: safe } : {};
            },
          },
        },
      },
    ];
  },
});

export const InlineStyleMark = Mark.create({
  name: 'inlineStyle',

  addAttributes() {
    return {
      style: {
        default: null,
        parseHTML: (element) =>
          sanitizeSafeInlineStyle((element as HTMLElement).getAttribute('style')),
        renderHTML: (attributes) => {
          const safe = sanitizeSafeInlineStyle(attributes.style as string | null);
          return safe ? { style: safe } : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          if (el.hasAttribute('data-type')) return false;
          const handledByTextColor = Boolean(sanitizeCssColor(el.style.color));
          const safe = sanitizeSafeInlineStyle(el.getAttribute('style'), {
            excludeColor: handledByTextColor,
          });
          return safe ? { style: safe } : false;
        },
      },
      {
        tag: 'mark',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const raw = el.getAttribute('style') || '';
          const safe = sanitizeSafeInlineStyle(raw);
          const hasBg = /(?:^|;)\s*background(?:-color)?\s*:/i.test(safe || '');
          if (hasBg) {
            return { style: safe };
          }
          const baseHighlight =
            'background-color: rgba(250, 204, 21, 0.35); padding: 0.05em 0.28em; border-radius: 4px';
          return {
            style: safe ? `${baseHighlight}; ${safe}` : baseHighlight,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

export const StyledBoxNode = Node.create({
  name: 'styledBox',
  group: 'block',
  content: 'block+',

  parseHTML() {
    const matchStyledContainer = (element: HTMLElement) => {
      if (element.hasAttribute('data-type')) return false;
      if (element.classList.contains('tableWrapper')) return false;
      const safe = sanitizeSafeInlineStyle(element.getAttribute('style'));
      return safe ? {} : false;
    };

    return [
      { tag: 'div[data-type="styledBox"]' },
      { tag: 'div[style]', getAttrs: (el) => matchStyledContainer(el as HTMLElement) },
      { tag: 'section[style]', getAttrs: (el) => matchStyledContainer(el as HTMLElement) },
      { tag: 'article[style]', getAttrs: (el) => matchStyledContainer(el as HTMLElement) },
      { tag: 'aside[style]', getAttrs: (el) => matchStyledContainer(el as HTMLElement) },
      { tag: 'header[style]', getAttrs: (el) => matchStyledContainer(el as HTMLElement) },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'styledBox' }), 0];
  },
});

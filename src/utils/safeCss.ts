const ALLOWED_CSS_PROPS = new Set([
  // Color & Backgrounds
  'color',
  'background',
  'background-color',
  'background-image',
  'opacity',

  // Typography
  'font-size',
  'font-weight',
  'font-style',
  'font-family',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-decoration-color',
  'text-decoration-style',
  'text-transform',
  'text-shadow',
  'white-space',
  'word-break',
  'direction',

  // Spacing & Box Model
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
  'margin-block',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-inline',
  'padding-inline-start',
  'padding-inline-end',
  'padding-block',
  'box-sizing',

  // Borders & Elevation
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-width',
  'border-style',
  'border-color',
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border-collapse',
  'border-spacing',
  'outline',
  'outline-offset',
  'box-shadow',

  // Sizing & In-flow Layout
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'display',
  'flex',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'grid-template-columns',
  'grid-template-rows',
  'grid-column',
  'grid-row',
  'gap',
  'row-gap',
  'column-gap',
  'justify-content',
  'align-items',
  'align-content',
  'align-self',
  'justify-items',
  'place-items',
  'vertical-align',
  'overflow',
  'overflow-x',
  'overflow-y',
  'table-layout',
  'list-style',
  'list-style-type',
]);

const ALLOWED_DISPLAY_VALUES = new Set([
  'block',
  'inline',
  'inline-block',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'list-item',
]);

const UNSAFE_CSS_VALUE_RE =
  /(url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:|-moz-binding|[<>`{}])/i;

function splitCssDeclarations(raw: string): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  let current = '';
  let parenDepth = 0;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote && raw[i - 1] !== '\\') {
        quote = null;
      }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') parenDepth += 1;
    else if (ch === ')' && parenDepth > 0) parenDepth -= 1;

    if (ch === ';' && parenDepth === 0) {
      const colonIdx = current.indexOf(':');
      if (colonIdx > 0) {
        result.push([current.slice(0, colonIdx).trim(), current.slice(colonIdx + 1).trim()]);
      }
      current = '';
      continue;
    }
    current += ch;
  }

  if (current.trim()) {
    const colonIdx = current.indexOf(':');
    if (colonIdx > 0) {
      result.push([current.slice(0, colonIdx).trim(), current.slice(colonIdx + 1).trim()]);
    }
  }

  return result;
}

function isSafeCssDeclaration(prop: string, value: string): boolean {
  if (!ALLOWED_CSS_PROPS.has(prop)) return false;
  if (!value || value.length > 500) return false;
  if (UNSAFE_CSS_VALUE_RE.test(value)) return false;

  if (prop === 'display') {
    const normalized = value.replace(/\s*!important$/i, '').trim().toLowerCase();
    return ALLOWED_DISPLAY_VALUES.has(normalized);
  }
  return true;
}

export function sanitizeSafeInlineStyle(
  rawStyle: string | null | undefined,
  options?: { excludeColor?: boolean }
): string | null {
  if (!rawStyle || !rawStyle.trim()) return null;

  const map = new Map<string, string>();
  for (const [rawProp, rawVal] of splitCssDeclarations(rawStyle)) {
    const prop = rawProp.toLowerCase();
    // Strip trailing !important so declarations compose cleanly without breaking editor overrides
    const val = rawVal.replace(/\s*!important$/i, '').trim();
    if (options?.excludeColor && prop === 'color') continue;
    if (!isSafeCssDeclaration(prop, val)) continue;
    map.set(prop, val);
  }

  if (map.size === 0) return null;
  return Array.from(map.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

function splitSelectors(selectorGroup: string): string[] {
  const selectors: string[] = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < selectorGroup.length; i += 1) {
    const ch = selectorGroup[i];
    if (quote) {
      if (ch === quote && selectorGroup[i - 1] !== '\\') quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') parenDepth += 1;
    else if (ch === ')' && parenDepth > 0) parenDepth -= 1;
    else if (ch === '[') bracketDepth += 1;
    else if (ch === ']' && bracketDepth > 0) bracketDepth -= 1;

    if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) selectors.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) selectors.push(trimmed);
  return selectors;
}

function parseTopLevelCssRules(rawCss: string): Array<{ selectors: string[]; body: string }> {
  // Strip comments
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Array<{ selectors: string[]; body: string }> = [];

  let i = 0;
  const len = css.length;

  while (i < len) {
    while (i < len && /\s/.test(css[i])) i += 1;
    if (i >= len) break;

    // Skip @-rules (like @media, @keyframes, @import) cleanly
    if (css[i] === '@') {
      let depth = 0;
      while (i < len) {
        if (css[i] === '{') depth += 1;
        else if (css[i] === '}') {
          depth -= 1;
          if (depth <= 0) {
            i += 1;
            break;
          }
        } else if (css[i] === ';' && depth === 0) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    const braceStart = css.indexOf('{', i);
    if (braceStart === -1) break;

    const selectorPart = css.slice(i, braceStart).trim();
    let depth = 1;
    let j = braceStart + 1;
    let quote: '"' | "'" | null = null;

    while (j < len && depth > 0) {
      const ch = css[j];
      if (quote) {
        if (ch === quote && css[j - 1] !== '\\') quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
      }
      j += 1;
    }

    const body = css.slice(braceStart + 1, Math.max(braceStart + 1, j - 1)).trim();
    if (selectorPart && body && !selectorPart.includes('{')) {
      rules.push({ selectors: splitSelectors(selectorPart), body });
    }
    i = j;
  }

  return rules;
}

const SKIP_SELECTOR_RE =
  /(::?before|::?after|::?first-line|::?first-letter|:hover|:active|:focus|:focus-within|:focus-visible|:visited|:target|:root|\bhtml\b|\bbody\b|^\s*\*\s*$)/i;

const SAFE_SIMPLE_COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\([^)]+\)|hsla?\([^)]+\))$/;

/**
 * Resolves `<style>` CSS blocks from both `doc.head` and `doc.body` and inlines
 * safe matched CSS declarations directly onto target elements (with explicit
 * inline `style="..."` taking highest precedence).
 */
export function inlineStyleBlocksIntoDocument(doc: Document): void {
  const styleElements = [
    ...Array.from(doc.head?.querySelectorAll('style') ?? []),
    ...Array.from(doc.body.querySelectorAll('style')),
  ];

  const mergedDeclarations = new WeakMap<Element, Map<string, string>>();
  const ensureMap = (el: Element) => {
    let map = mergedDeclarations.get(el);
    if (!map) {
      map = new Map<string, string>();
      mergedDeclarations.set(el, map);
    }
    return map;
  };

  for (const styleEl of styleElements) {
    const cssText = styleEl.textContent || '';
    const rules = parseTopLevelCssRules(cssText);

    for (const rule of rules) {
      const parsedDecls = splitCssDeclarations(rule.body)
        .map(([p, v]) => [p.toLowerCase(), v.replace(/\s*!important$/i, '').trim()] as const)
        .filter(([p, v]) => isSafeCssDeclaration(p, v));

      if (parsedDecls.length === 0) continue;

      for (const selector of rule.selectors) {
        if (!selector || SKIP_SELECTOR_RE.test(selector)) continue;
        try {
          const matched = doc.body.querySelectorAll(selector);
          for (const el of Array.from(matched)) {
            const map = ensureMap(el);
            for (const [p, v] of parsedDecls) {
              map.set(p, v);
            }
          }
        } catch {
          // Ignore invalid or unsupported CSS selectors gracefully
        }
      }
    }
  }

  // Convert legacy HTML presentational attributes & merge with <style> rules + inline style="..."
  const allElements = Array.from(doc.body.querySelectorAll('*'));
  for (const el of allElements) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'style' || tag === 'script') continue;

    const map = mergedDeclarations.get(el) ?? new Map<string, string>();

    const bgColor = el.getAttribute('bgcolor')?.trim();
    if (bgColor && SAFE_SIMPLE_COLOR_RE.test(bgColor) && !map.has('background') && !map.has('background-color')) {
      map.set('background-color', bgColor);
    }
    el.removeAttribute('bgcolor');

    const alignAttr = el.getAttribute('align')?.trim().toLowerCase();
    if (
      alignAttr &&
      (alignAttr === 'left' || alignAttr === 'right' || alignAttr === 'center' || alignAttr === 'justify') &&
      !map.has('text-align')
    ) {
      map.set('text-align', alignAttr);
    }
    el.removeAttribute('align');

    const valignAttr = el.getAttribute('valign')?.trim().toLowerCase();
    if (
      valignAttr &&
      (valignAttr === 'top' || valignAttr === 'middle' || valignAttr === 'bottom') &&
      !map.has('vertical-align')
    ) {
      map.set('vertical-align', valignAttr);
    }
    el.removeAttribute('valign');

    if (tag === 'font') {
      const fontColor = el.getAttribute('color')?.trim();
      if (fontColor && SAFE_SIMPLE_COLOR_RE.test(fontColor) && !map.has('color')) {
        map.set('color', fontColor);
      }
      el.removeAttribute('color');
    }

    const inlineRaw = el.getAttribute('style');
    if (inlineRaw) {
      for (const [rawProp, rawVal] of splitCssDeclarations(inlineRaw)) {
        const prop = rawProp.toLowerCase();
        const val = rawVal.replace(/\s*!important$/i, '').trim();
        if (isSafeCssDeclaration(prop, val)) {
          map.set(prop, val);
        }
      }
    }

    if (map.size > 0) {
      const combined = Array.from(map.entries())
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
      const sanitized = sanitizeSafeInlineStyle(combined);
      if (sanitized) {
        el.setAttribute('style', sanitized);
      } else {
        el.removeAttribute('style');
      }
    } else if (inlineRaw !== null) {
      el.removeAttribute('style');
    }
  }
}

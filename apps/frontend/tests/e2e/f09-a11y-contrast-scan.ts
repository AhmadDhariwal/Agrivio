import { expect, type Page } from '@playwright/test';

export type ContrastKind = 'text-normal' | 'text-large' | 'non-text';

export type ContrastCheck = {
  page: string;
  component: string;
  state: string;
  kind: ContrastKind;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  pass: boolean;
  skipReason?: string;
  unreliableBackground: boolean;
};

type ScanResult = {
  checks: ContrastCheck[];
  skippedInactive: number;
};

function scanInPage(pageName: string): ScanResult {
  const WHITE = { r: 255, g: 255, b: 255, a: 1 };
  const PAGE_BG_LIGHT = { r: 238, g: 243, b: 239, a: 1 };
  const PAGE_BG_DARK = { r: 228, g: 235, b: 229, a: 1 };

  type Rgba = { r: number; g: number; b: number; a: number };

  function clampChannel(value: number): number {
    return Math.min(255, Math.max(0, value));
  }

  function parseCssColor(input: string): Rgba | null {
    if (!input || input === 'transparent') {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const rgb = input.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (rgb) {
      return {
        r: clampChannel(Number(rgb[1])),
        g: clampChannel(Number(rgb[2])),
        b: clampChannel(Number(rgb[3])),
        a: rgb[4] === undefined ? 1 : Number(rgb[4]),
      };
    }
    const modern = input.match(
      /^rgba?\(\s*([\d.]+)(?:\s+|\/)\s*([\d.]+)(?:\s+|\/)\s*([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i,
    );
    if (modern) {
      const alphaRaw = modern[4];
      let a = 1;
      if (alphaRaw !== undefined) {
        a = alphaRaw.endsWith('%') ? Number(alphaRaw.slice(0, -1)) / 100 : Number(alphaRaw);
      }
      return {
        r: clampChannel(Number(modern[1])),
        g: clampChannel(Number(modern[2])),
        b: clampChannel(Number(modern[3])),
        a,
      };
    }
    return null;
  }

  function composite(fg: Rgba, bg: Rgba): Rgba {
    const a = fg.a + bg.a * (1 - fg.a);
    if (a === 0) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    return {
      r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
      g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
      b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
      a,
    };
  }

  function toHex(color: Rgba): string {
    const opaque = color.a >= 0.99 ? color : composite(color, WHITE);
    const hex = [opaque.r, opaque.g, opaque.b]
      .map((channel) => Math.round(clampChannel(channel)).toString(16).padStart(2, '0'))
      .join('');
    return `#${hex}`;
  }

  function relativeLuminance(color: Rgba): number {
    const opaque = color.a >= 0.99 ? color : composite(color, WHITE);
    const channels = [opaque.r, opaque.g, opaque.b].map((value) => {
      const srgb = value / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(a: Rgba, b: Rgba): number {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function hasUnreliableImage(style: CSSStyleDeclaration): boolean {
    const image = style.backgroundImage;
    return Boolean(image && image !== 'none' && /gradient|url\(/i.test(image));
  }

  function isVisible(el: Element): boolean {
    const html = el as HTMLElement;
    const style = getComputedStyle(html);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    const rect = html.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) {
      return false;
    }
    return true;
  }

  function isInactive(el: Element): boolean {
    const html = el as HTMLElement;
    return (
      html.matches(':disabled, [disabled], [aria-disabled="true"]') ||
      Boolean(html.closest('[aria-disabled="true"], fieldset:disabled'))
    );
  }

  function describe(el: Element): string {
    const html = el as HTMLElement;
    return (
      html.getAttribute('data-testid') ||
      html.getAttribute('name') ||
      html.id ||
      html.className.toString().split(/\s+/).filter(Boolean).slice(0, 3).join('.') ||
      html.tagName.toLowerCase()
    );
  }

  function effectiveBackgrounds(el: Element): { colors: Rgba[]; unreliable: boolean } {
    const layers: Rgba[] = [];
    let unreliable = false;
    let node: Element | null = el instanceof Text ? el.parentElement : (el as Element);
    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node);
      if (hasUnreliableImage(style)) {
        unreliable = true;
      }
      const parsed = parseCssColor(style.backgroundColor);
      if (parsed && parsed.a > 0.02) {
        layers.push(parsed);
        if (parsed.a >= 0.99) {
          let stacked = layers[layers.length - 1];
          for (let i = layers.length - 2; i >= 0; i -= 1) {
            stacked = composite(layers[i], stacked);
          }
          return { colors: [stacked], unreliable };
        }
      }
      node = node.parentElement;
    }
    if (unreliable) {
      return { colors: [PAGE_BG_LIGHT, PAGE_BG_DARK, WHITE], unreliable: true };
    }
    return { colors: [PAGE_BG_LIGHT], unreliable };
  }

  function isLargeText(style: CSSStyleDeclaration): boolean {
    const px = Number.parseFloat(style.fontSize);
    const weight = Number(style.fontWeight);
    const bold = weight >= 700 || style.fontWeight === 'bold';
    return px >= 24 || (bold && px >= 18.66);
  }

  const checks: ContrastCheck[] = [];
  let skippedInactive = 0;

  function addCheck(input: Omit<ContrastCheck, 'page' | 'ratio' | 'pass'> & { fg: Rgba; bgs: Rgba[] }): void {
    let worst = Infinity;
    let worstBg = input.bgs[0];
    for (const bg of input.bgs) {
      const ratio = contrastRatio(input.fg, bg);
      if (ratio < worst) {
        worst = ratio;
        worstBg = bg;
      }
    }
    const pass = worst + 1e-9 >= input.required;
    checks.push({
      page: pageName,
      component: input.component,
      state: input.state,
      kind: input.kind,
      foreground: toHex(input.fg),
      background: toHex(worstBg),
      ratio: Number(worst.toFixed(2)),
      required: input.required,
      pass,
      skipReason: input.skipReason,
      unreliableBackground: input.unreliableBackground,
    });
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textCount = 0;
  while (walker.nextNode() && textCount < 120) {
    const node = walker.currentNode as Text;
    const raw = node.nodeValue?.replace(/\s+/g, ' ').trim() ?? '';
    if (raw.length < 2) {
      continue;
    }
    const parent = node.parentElement;
    if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(parent.tagName)) {
      continue;
    }
    if (!isVisible(parent)) {
      continue;
    }
    if (isInactive(parent) || parent.closest('[disabled], [aria-disabled="true"]')) {
      skippedInactive += 1;
      continue;
    }
    const style = getComputedStyle(parent);
    const fg = parseCssColor(style.color);
    if (!fg || fg.a < 0.08) {
      continue;
    }
    const { colors, unreliable } = effectiveBackgrounds(parent);
    const large = isLargeText(style);
    addCheck({
      component: describe(parent),
      state: 'default',
      kind: large ? 'text-large' : 'text-normal',
      fg,
      bgs: colors,
      required: large ? 3 : 4.5,
      unreliableBackground: unreliable,
    });
    textCount += 1;
  }

  const interactives = Array.from(
    document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"]'),
  );
  for (const el of interactives) {
    if (!isVisible(el)) {
      continue;
    }
    if (isInactive(el)) {
      skippedInactive += 1;
      continue;
    }
    const style = getComputedStyle(el);
    const { colors: parentBgs, unreliable } = effectiveBackgrounds(el.parentElement ?? el);
    const ownBg = parseCssColor(style.backgroundColor);
    const borderWidth = Number.parseFloat(style.borderTopWidth) || 0;
    const borderColor = parseCssColor(style.borderTopColor);
    if (borderWidth >= 1 && borderColor && borderColor.a >= 0.4) {
      const interior = ownBg && ownBg.a >= 0.4 ? [ownBg] : parentBgs;
      addCheck({
        component: describe(el),
        state: 'default-border',
        kind: 'non-text',
        fg: borderColor,
        bgs: [...interior, ...parentBgs],
        required: 3,
        unreliableBackground: unreliable,
      });
    } else if (ownBg && ownBg.a >= 0.4) {
      const fillVsParent = Math.min(...parentBgs.map((bg) => contrastRatio(ownBg, bg)));
      const borderWidthFallback = Number.parseFloat(style.borderTopWidth) || 0;
      const borderFallback = parseCssColor(style.borderTopColor);
      if (fillVsParent < 3 && borderWidthFallback >= 1 && borderFallback && borderFallback.a >= 0.4) {
        addCheck({
          component: describe(el),
          state: 'default-border',
          kind: 'non-text',
          fg: borderFallback,
          bgs: parentBgs,
          required: 3,
          unreliableBackground: unreliable,
        });
      } else {
        addCheck({
          component: describe(el),
          state: 'default-fill',
          kind: 'non-text',
          fg: ownBg,
          bgs: parentBgs,
          required: 3,
          unreliableBackground: unreliable,
        });
      }
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const placeholder = getComputedStyle(el, '::placeholder').color;
      const ph = parseCssColor(placeholder);
      if (ph && ph.a >= 0.08 && (el.placeholder || '').length > 0) {
        const { colors } = effectiveBackgrounds(el);
        addCheck({
          component: `${describe(el)}::placeholder`,
          state: 'placeholder',
          kind: 'text-normal',
          fg: ph,
          bgs: colors,
          required: 4.5,
          unreliableBackground: false,
        });
      }
    }
  }

  const focused = document.activeElement as HTMLElement | null;
  if (focused && focused !== document.body && isVisible(focused) && !isInactive(focused)) {
    const style = getComputedStyle(focused);
    const outlineColor = parseCssColor(style.outlineColor);
    const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
    if (outlineWidth >= 1 && outlineColor && outlineColor.a >= 0.4) {
      const { colors, unreliable } = effectiveBackgrounds(focused.parentElement ?? focused);
      addCheck({
        component: describe(focused),
        state: 'focus-outline',
        kind: 'non-text',
        fg: outlineColor,
        bgs: colors,
        required: 3,
        unreliableBackground: unreliable,
      });
    }
  }

  return { checks, skippedInactive };
}

export async function collectContrastChecks(page: Page, pageName: string): Promise<ScanResult> {
  return page.evaluate(scanInPage, pageName);
}

export function assertContrastPass(result: ScanResult, pageName: string): void {
  const failures = result.checks.filter((check) => !check.pass && !check.skipReason);
  expect(
    failures,
    failures
      .slice(0, 12)
      .map(
        (check) =>
          `${pageName} ${check.component} [${check.state}/${check.kind}] ${check.foreground} on ${check.background} = ${check.ratio}:1 (need ${check.required}${check.unreliableBackground ? '; conservative gradient' : ''})`,
      )
      .join('\n') || `${pageName} contrast`,
  ).toEqual([]);
}

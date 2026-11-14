// Color helpers that keep agent colors readable (WCAG contrast).

type Rgb = [number, number, number];

// Darkest background an agent name is drawn on (private message bubble).
// A color readable here is readable on the lighter bubbles and cards too.
export const DARKEST_NAME_BACKGROUND = '#d9d6e2';

const DARK_INK = '#14161b';
const LIGHT_INK = '#ffffff';

export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  const value = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(value)) {
    return [102, 102, 102]; // neutral gray for anything unparsable
  }
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  const part = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

// Relative luminance, WCAG 2.x
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contrast ratio between two colors, from 1 (same) to 21 (black on white)
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Black or white, whichever reads better on the given background
export function inkOn(background: string): string {
  return contrastRatio(DARK_INK, background) >= contrastRatio(LIGHT_INK, background) ? DARK_INK : LIGHT_INK;
}

// Returns the color itself when it already has enough contrast with the
// background; otherwise the same hue moved toward black (or toward white on a
// dark background) just far enough to reach the minimum ratio.
export function ensureContrast(color: string, background: string, minRatio = 4.5): string {
  if (contrastRatio(color, background) >= minRatio) {
    return color;
  }

  const from = hexToRgb(color);
  const target: Rgb = luminance(background) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  const mix = (t: number) => rgbToHex(from.map((c, i) => c + (target[i] - c) * t) as Rgb);

  // Binary search for the smallest shift that is readable
  let low = 0;
  let high = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    if (contrastRatio(mix(mid), background) >= minRatio) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return mix(high);
}

// Agent color adjusted for use as text on any message bubble or card
export function readableNameColor(color: string): string {
  return ensureContrast(color, DARKEST_NAME_BACKGROUND);
}

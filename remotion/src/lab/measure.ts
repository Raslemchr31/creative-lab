import { cairo } from "../sirine/font";

// ─────────────────────────────────────────────────────────────────────────────
// Text measurement + auto-fit. Canvas measureText runs the same HarfBuzz shaping
// as the DOM, so a shaped Arabic line measures what it will render. Only valid
// once Cairo is loaded — LabAd mounts nothing that measures before that.
// An Arabic headline at 76 px once overflowed 1080 px: every line is fitted here,
// and lines are rendered `nowrap`, so the browser can never re-wrap or overflow.
// ─────────────────────────────────────────────────────────────────────────────

/** Cairo weights loaded by src/sirine/font.ts — use only these (800 silently became 900). */
export type Weight = 400 | 600 | 700 | 900;

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

const context = (): CanvasRenderingContext2D => {
  if (!ctx) {
    const g = document.createElement("canvas").getContext("2d");
    if (!g) throw new Error("lab: no 2D canvas for text measurement");
    ctx = g;
  }
  return ctx;
};

export const fontCss = (weight: Weight, size: number) => `${weight} ${size}px "${cairo}"`;

/** Shaped advance width in px. `spacing` = CSS letter-spacing (never use it on Arabic). */
export const textWidth = (text: string, size: number, weight: Weight, spacing = 0): number => {
  if (!text) return 0;
  const key = `${weight}\u0001${text}`;
  let w100 = cache.get(key);
  if (w100 === undefined) {
    const g = context();
    g.font = fontCss(weight, 100);
    w100 = g.measureText(text).width;
    // never cache a fallback-font measurement
    if (document.fonts.check(fontCss(weight, 100), text)) cache.set(key, w100);
  }
  return (w100 * size) / 100 + spacing * Array.from(text).length;
};

const CURRENCY = /^(دج|د\.ج|DA|DZD|€|\$)$/i;
const JOINER = /^[·•|\-–—:!?؟،,.]+$/;

/** Words, but a number never leaves its currency and a lone "·" sticks to the word before it. */
export const tokenize = (text: string): string[] => {
  const raw = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const t of raw) {
    const prev = out[out.length - 1];
    if (prev !== undefined && (CURRENCY.test(t) && /\d$/.test(prev))) out[out.length - 1] = `${prev} ${t}`;
    else if (prev !== undefined && JOINER.test(t)) out[out.length - 1] = `${prev} ${t}`;
    else out.push(t);
  }
  return out;
};

const join = (tokens: string[], a: number, b: number) => tokens.slice(a, b).join(" ");

/** Split tokens into n lines minimising the widest line (exhaustive for n ≤ 3). */
const bestSplit = (tokens: string[], n: number, width: (s: string) => number): string[] => {
  const T = tokens.length;
  if (n <= 1 || T <= 1) return [join(tokens, 0, T)];
  let best: string[] = [join(tokens, 0, T)];
  let bestW = Infinity;
  if (n === 2) {
    for (let i = 1; i < T; i++) {
      const l = [join(tokens, 0, i), join(tokens, i, T)];
      const w = Math.max(width(l[0]), width(l[1]));
      if (w < bestW) {
        bestW = w;
        best = l;
      }
    }
    return best;
  }
  for (let i = 1; i < T - 1; i++) {
    for (let j = i + 1; j < T; j++) {
      const l = [join(tokens, 0, i), join(tokens, i, j), join(tokens, j, T)];
      const w = Math.max(width(l[0]), width(l[1]), width(l[2]));
      if (w < bestW) {
        bestW = w;
        best = l;
      }
    }
  }
  return best;
};

export type Fitted = { lines: string[]; size: number; widest: number };

/**
 * Fit `text` into `maxW` px. Prefers ONE line shrunk by at most `keep` (default 18 %),
 * then balanced 2–3 line splits, and always ends ≤ maxW (shrinking further if it must).
 * Explicit "\n" in the text are honoured as forced line breaks.
 */
export const fitText = (
  text: string,
  o: { base: number; maxW: number; weight: Weight; maxLines?: number; keep?: number; spacing?: number },
): Fitted => {
  const w = (s: string) => textWidth(s, o.base, o.weight, o.spacing ?? 0);
  const scaled = (lines: string[]): Fitted => {
    const widest = Math.max(...lines.map(w), 1);
    const size = widest > o.maxW ? (o.base * o.maxW) / widest : o.base;
    return { lines, size, widest: (widest * size) / o.base };
  };
  const forced = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
  if (forced.length > 1) return scaled(forced);
  const tokens = tokenize(text);
  const maxLines = Math.max(1, Math.min(3, o.maxLines ?? 2, tokens.length));
  const options: Fitted[] = [];
  for (let n = 1; n <= maxLines; n++) options.push(scaled(bestSplit(tokens, n, w)));
  const keep = o.keep ?? 0.82;
  const ok = options.find((f) => f.size >= o.base * keep);
  if (ok) return ok;
  return options.reduce((a, b) => (b.size > a.size * 1.02 ? b : a));
};

/** "4,200 دج" → { amount: "4,200", currency: "دج" }; "4 200 DA" → { "4 200", "DA" }. */
export const parsePrice = (s: string): { amount: string; currency: string; currencyFirst: boolean } | null => {
  const t = s.trim();
  let m = t.match(/^(\d[\d.,\s  ]*\d|\d)\s*(\D.*)?$/u);
  if (m) return { amount: m[1].trim(), currency: (m[2] ?? "").trim(), currencyFirst: false };
  m = t.match(/^(\D*?\D)\s*(\d[\d.,\s  ]*\d|\d)$/u);
  if (m) return { amount: m[2].trim(), currency: m[1].trim(), currencyFirst: true };
  return null;
};

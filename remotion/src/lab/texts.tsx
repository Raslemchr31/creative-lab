import React, { useMemo } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { cairo } from "../sirine/font";
import { bandLuminance, useImageInfo, type ImageInfo } from "./analyze";
import { clamp, rise, useEdl, useStill } from "./context";
import { fitText, parsePrice, textWidth } from "./measure";
import type { NEdl, NSegment, NText } from "./normalize";
import type { TextPosition } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Segment texts. Every block is MEASURED before it is placed (fitText), each line is
// rendered nowrap, and every block is clamped inside the safe band (safe.top → the rail
// or safe.bottom) and the side margins — so nothing can overflow 1080 px or enter the
// Reels UI. Blocks that share a `position` stack top→bottom when their time windows
// overlap (kicker over headline); sequential captions reuse the same spot.
// Tone: ink text on light plates (light fill, or a light area of a photo), white text +
// soft scrim on dark plates / video. Arabic only ever animates opacity / translate / blur.
// ─────────────────────────────────────────────────────────────────────────────

type Tone = "light" | "dark";
type Env = { o: number; y: number; blur: number; f: number; fps: number; still: boolean; first: boolean };
type Block = { t: NText; w: number; h: number; align: "center" | "start"; boxed: boolean; draw: (env: Env) => React.ReactNode };

const SHADOW = "0 2px 22px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.45)";
const PANEL = "rgba(12,12,12,0.86)";
const HAIR = "1px solid rgba(255,255,255,0.20)";
const WHITE = "#FFFFFF";
const CURRENCY = /^(دج|د\.ج|DA|DZD|€|\$)$/i;

/** A whole-line price ("4,200 دج") is pinned LTR so bidi can never reorder digits and currency. */
export const isPrice = (s: string) => {
  const p = parsePrice(s);
  return !!p && CURRENCY.test(p.currency);
};
const ltrIf = (s: string): React.CSSProperties => (isPrice(s) ? { direction: "ltr", unicodeBidi: "isolate" } : {});

/** solid chip colours, always max contrast with what is behind: paper chip on dark plates, ink chip on light ones */
const chip = (tone: Tone, edl: NEdl) => (tone === "dark" ? { bg: edl.theme.paper, fg: edl.theme.ink } : { bg: edl.theme.ink, fg: edl.theme.paper });
/** `highlight` on a chip style = a detached outline ring (sticker emphasis). Inverting instead put cream chips on white photos. */
const ring = (on: boolean, color: string, k: number): React.CSSProperties =>
  on ? { outline: `${Math.max(2, 2.5 * k).toFixed(1)}px solid ${color}`, outlineOffset: 5 * k } : {};

/** "#F4F1EA" → "rgba(244,241,234,a)" (fallback white) */
const rgba = (css: string, a: number) => {
  const h = css.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!h) return `rgba(255,255,255,${a})`;
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const n = parseInt(x, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const heading = (t: NText, tone: Tone, k: number, maxW: number, edl: NEdl, big: boolean): Block => {
  const eb = t.emphasis === "big";
  const base = (big ? (eb ? 186 : 150) : eb ? 112 : 92) * k;
  const maxLines = big ? 2 : 3;
  if (t.emphasis !== "highlight") {
    const fit = fitText(t.text, { base, maxW, weight: 900, maxLines });
    const lineH = fit.size * (big ? 1.14 : 1.24);
    const color = tone === "dark" ? WHITE : edl.theme.ink;
    return {
      t,
      w: fit.widest,
      h: fit.lines.length * lineH,
      align: "center",
      boxed: false,
      draw: () => (
        <div style={{ fontSize: fit.size, fontWeight: 900, lineHeight: `${lineH}px`, color, textShadow: tone === "dark" ? SHADOW : undefined, textAlign: "center" }}>
          {fit.lines.map((l, i) => (
            <div key={i} style={{ whiteSpace: "nowrap", ...ltrIf(l) }}>
              {l}
            </div>
          ))}
        </div>
      ),
    };
  }
  // highlight: one marker box per line
  const padX = (big ? 36 : 28) * k;
  const fit = fitText(t.text, { base, maxW: maxW - 2 * padX, weight: 900, maxLines });
  const boxH = fit.size * 1.36;
  const gap = 10 * k;
  const c = chip(tone, edl);
  return {
    t,
    w: fit.widest + 2 * padX,
    h: fit.lines.length * boxH + (fit.lines.length - 1) * gap,
    align: "center",
    boxed: true,
    draw: () => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap }}>
        {fit.lines.map((l, i) => (
          <div
            key={i}
            style={{ height: boxH, lineHeight: `${boxH}px`, padding: `0 ${padX}px`, background: c.bg, color: c.fg, fontSize: fit.size, fontWeight: 900, borderRadius: 16 * k, whiteSpace: "nowrap", boxShadow: "0 10px 30px rgba(0,0,0,0.20)", ...ltrIf(l) }}
          >
            {l}
          </div>
        ))}
      </div>
    ),
  };
};

const kicker = (t: NText, tone: Tone, k: number, maxW: number, edl: NEdl): Block => {
  const padX = 24 * k;
  const fit = fitText(t.text, { base: (t.emphasis === "big" ? 40 : 34) * k, maxW: maxW - 2 * padX, weight: 700, maxLines: 1 });
  const h = fit.size * 1.5 + 8 * k;
  const hl = t.emphasis === "highlight";
  const c = chip(tone, edl);
  return {
    t,
    w: fit.widest + 2 * padX,
    h,
    align: "center",
    boxed: true,
    draw: () => (
      <div style={{ height: h, lineHeight: `${h}px`, padding: `0 ${padX}px`, borderRadius: 999, background: c.bg, color: c.fg, fontSize: fit.size, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 10px 30px rgba(0,0,0,0.22)", ...ring(hl, c.bg, k), ...ltrIf(t.text) }}>
        {fit.lines[0]}
      </div>
    ),
  };
};

const pill = (t: NText, tone: Tone, k: number, maxW: number, edl: NEdl): Block => {
  const padX = 30 * k;
  const fit = fitText(t.text, { base: (t.emphasis === "big" ? 46 : 40) * k, maxW: maxW - 2 * padX - 2, weight: 700, maxLines: 1 });
  const h = fit.size * 1.5 + 14 * k;
  const hl = t.emphasis === "highlight";
  // normal: translucent ink panel on dark plates, solid ink on light ones; highlight: the max-contrast chip (+ ring on light)
  const c = chip(tone, edl);
  const bg = hl ? c.bg : tone === "dark" ? PANEL : edl.theme.ink;
  const fg = hl ? c.fg : WHITE;
  return {
    t,
    w: fit.widest + 2 * padX + 2,
    h,
    align: "center",
    boxed: true,
    draw: () => (
      <div style={{ height: h, boxSizing: "border-box", lineHeight: `${h - 2}px`, padding: `0 ${padX}px`, borderRadius: 999, background: bg, border: hl ? "1px solid transparent" : HAIR, color: fg, fontSize: fit.size, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 10px 30px rgba(0,0,0,0.22)", ...ring(hl && tone === "light", bg, k), ...ltrIf(t.text) }}>
        {fit.lines[0]}
      </div>
    ),
  };
};

const badge = (t: NText, tone: Tone, k: number, maxW: number, edl: NEdl): Block => {
  const eb = t.emphasis === "big";
  const D = Math.min((eb ? 252 : 210) * k, maxW);
  const fit = fitText(t.text, { base: (eb ? 54 : 46) * k, maxW: D * 0.72, weight: 900, maxLines: 2, keep: 0.9 });
  const lh = 1.14;
  const size = Math.min(fit.size, (D * 0.6) / (fit.lines.length * lh));
  const hl = t.emphasis === "highlight";
  const c = chip(tone, edl);
  return {
    t,
    w: D,
    h: D,
    align: "start",
    boxed: true,
    draw: () => (
      <div
        style={{ position: "relative", width: D, height: D, borderRadius: "50%", background: c.bg, color: c.fg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: "0 14px 36px rgba(0,0,0,0.26)", ...ring(hl, c.bg, k), fontSize: size, fontWeight: 900, lineHeight: `${size * lh}px`, textAlign: "center" }}
      >
        <div style={{ position: "absolute", inset: 8 * k, borderRadius: "50%", border: `${Math.max(1, 1.5 * k)}px solid ${c.fg}`, opacity: 0.3 }} />
        {fit.lines.map((l, i) => (
          <div key={i} style={{ whiteSpace: "nowrap", ...ltrIf(l) }}>
            {l}
          </div>
        ))}
      </div>
    ),
  };
};

const priceTag = (t: NText, tone: Tone, k: number, maxW: number, edl: NEdl): Block => {
  const p = parsePrice(t.text);
  const hl = t.emphasis === "highlight";
  const c = chip(tone, edl);
  const a0 = (t.emphasis === "big" ? 136 : 112) * k;
  if (!p) {
    // not a price: show the text as a big capsule rather than failing the ad
    const padX = 40 * k;
    const fit = fitText(t.text, { base: a0 * 0.6, maxW: maxW - 2 * padX, weight: 900, maxLines: 1 });
    const h = fit.size * 1.5 + 14 * k;
    return {
      t,
      w: fit.widest + 2 * padX,
      h,
      align: "center",
      boxed: true,
      draw: () => <div style={{ height: h, lineHeight: `${h}px`, padding: `0 ${padX}px`, borderRadius: 999, background: c.bg, color: c.fg, fontSize: fit.size, fontWeight: 900, whiteSpace: "nowrap", ...ring(hl, c.bg, k) }}>{fit.lines[0]}</div>,
    };
  }
  const cur0 = a0 * 0.46;
  const gap0 = a0 * 0.12;
  const padX0 = 46 * k;
  const w0 = textWidth(p.amount, a0, 900, -1) + (p.currency ? gap0 + textWidth(p.currency, cur0, 900) : 0) + 2 * padX0;
  const s = Math.min(1, maxW / w0);
  const a = a0 * s;
  const h = a * 1.26 + 12 * k * s;
  const amount = (
    <span key="a" style={{ fontSize: a, fontWeight: 900, letterSpacing: -1 }}>
      {p.amount}
    </span>
  );
  const cur = p.currency ? (
    <span key="c" style={{ fontSize: cur0 * s, fontWeight: 900 }}>
      {p.currency}
    </span>
  ) : null;
  return {
    t,
    w: w0 * s,
    h,
    align: "center",
    boxed: true,
    draw: () => (
      <div
        style={{ height: h, padding: `0 ${padX0 * s}px`, borderRadius: 999, background: c.bg, color: c.fg, display: "flex", direction: "ltr", alignItems: "baseline", justifyContent: "center", gap: gap0 * s, lineHeight: `${h}px`, whiteSpace: "nowrap", boxShadow: "0 14px 36px rgba(0,0,0,0.24)", ...ring(hl, c.bg, k) }}
      >
        {p.currencyFirst ? [cur, amount] : [amount, cur]}
      </div>
    ),
  };
};

const checklist = (t: NText, tone: Tone, k: number, maxW: number, edl: NEdl): Block => {
  const dark = tone === "dark";
  const padX = dark ? 34 * k : 0;
  const padY = dark ? 24 * k : 0;
  const border = dark ? 2 : 0;
  const inner = maxW - 2 * padX - border;
  const itemBase = (t.emphasis === "big" ? 48 : 42) * k;
  const disc0 = 46 * k;
  const gapX0 = 18 * k;
  let itemSize = itemBase;
  for (const it of t.items) itemSize = Math.min(itemSize, fitText(it, { base: itemBase, maxW: inner - disc0 - gapX0, weight: 700, maxLines: 1 }).size);
  const r = itemSize / itemBase;
  const disc = disc0 * r;
  const gapX = gapX0 * r;
  const rowH = Math.max(disc, itemSize * 1.5);
  const rowGap = 10 * k;
  const itemsW = Math.max(...t.items.map((it) => textWidth(it, itemSize, 700))) + disc + gapX;
  const title = t.text ? fitText(t.text, { base: 42 * k, maxW: inner, weight: 900, maxLines: 2 }) : null;
  const titleLH = title ? title.size * 1.34 : 0;
  const titleGap = 10 * k;
  const titleH = title ? title.lines.length * titleLH + titleGap : 0;
  const w = Math.max(itemsW, title ? title.widest : 0) + 2 * padX + border;
  const h = titleH + t.items.length * rowH + (t.items.length - 1) * rowGap + 2 * padY + border;
  const fg = dark ? WHITE : edl.theme.ink;
  const discBg = dark ? edl.theme.paper : edl.theme.ink;
  const tick = dark ? edl.theme.ink : edl.theme.paper;
  return {
    t,
    w,
    h,
    align: "center",
    boxed: dark,
    draw: (env) => (
      <div
        style={{ width: w, height: h, boxSizing: "border-box", padding: `${padY}px ${padX}px`, borderRadius: 34 * k, background: dark ? "rgba(16,16,18,0.84)" : undefined, border: dark ? HAIR : undefined, boxShadow: dark ? "0 14px 40px rgba(0,0,0,0.28)" : undefined, color: fg, display: "flex", flexDirection: "column", alignItems: "flex-start" }}
      >
        {title ? (
          <div style={{ fontSize: title.size, fontWeight: 900, lineHeight: `${titleLH}px`, marginBottom: titleGap }}>
            {title.lines.map((l, i) => (
              <div key={i} style={{ whiteSpace: "nowrap" }}>
                {l}
              </div>
            ))}
          </div>
        ) : null}
        {t.items.map((it, i) => {
          const s = env.still || env.first ? 1 : rise(env.f, env.fps, t.atF + 5 + i * 5, 16);
          return (
            <div key={i} style={{ height: rowH, marginTop: i === 0 ? 0 : rowGap, display: "flex", alignItems: "center", gap: gapX, opacity: s, transform: s < 0.999 ? `translateY(${((1 - s) * 12 * k).toFixed(2)}px)` : undefined }}>
              <div style={{ width: disc, height: disc, flex: "none", borderRadius: "50%", background: discBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width={disc * 0.6} height={disc * 0.6} viewBox="0 0 24 24">
                  <path d="M5 12.6l4.6 4.6L19 7.4" fill="none" stroke={tick} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ fontSize: itemSize, fontWeight: 700, lineHeight: `${rowH}px`, whiteSpace: "nowrap", ...ltrIf(it) }}>{it}</div>
            </div>
          );
        })}
      </div>
    ),
  };
};

const subtitle = (t: NText, tone: Tone, k: number, maxW: number, edl: NEdl): Block => {
  const padX = 22 * k;
  const fit = fitText(t.text, { base: (t.emphasis === "big" ? 54 : 46) * k, maxW: maxW - 2 * padX, weight: 700, maxLines: 2 });
  const boxH = fit.size * 1.44 + 6 * k;
  const gap = 8 * k;
  const hl = t.emphasis === "highlight";
  const c = chip(tone, edl);
  const bg = hl ? c.bg : "rgba(10,10,10,0.74)";
  const fg = hl ? c.fg : WHITE;
  return {
    t,
    w: fit.widest + 2 * padX,
    h: fit.lines.length * boxH + (fit.lines.length - 1) * gap,
    align: "center",
    boxed: true,
    draw: () => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap }}>
        {fit.lines.map((l, i) => (
          <div key={i} style={{ height: boxH, lineHeight: `${boxH}px`, padding: `0 ${padX}px`, borderRadius: 14 * k, background: bg, color: fg, fontSize: fit.size, fontWeight: 700, whiteSpace: "nowrap", ...ltrIf(l) }}>
            {l}
          </div>
        ))}
      </div>
    ),
  };
};

const buildBlock = (t: NText, tone: Tone, k: number, maxW: number, edl: NEdl): Block => {
  switch (t.style) {
    case "headline":
      return heading(t, tone, k, maxW, edl, false);
    case "big":
      return heading(t, tone, k, maxW, edl, true);
    case "kicker":
      return kicker(t, tone, k, maxW, edl);
    case "pill":
      return pill(t, tone, k, maxW, edl);
    case "badge":
      return badge(t, tone, k, maxW, edl);
    case "price_tag":
      return priceTag(t, tone, k, maxW, edl);
    case "checklist":
      return checklist(t, tone, k, maxW, edl);
    case "subtitle":
      return subtitle(t, tone, k, maxW, edl);
  }
};

type Laid = { offs: number[]; extent: number; top: number };
/** group centre as a fraction of the text band (top is anchored to the band's top edge instead) */
const CENTRE: Record<TextPosition, number> = { top: 0, upper_third: 0.3, center: 0.5, lower_third: 0.8 };

const stack = (blocks: Block[], pos: TextPosition, band: { top: number; bottom: number }, gap: number): Laid => {
  const offs: number[] = [];
  blocks.forEach((b, i) => {
    let off = 0;
    for (let j = 0; j < i; j++) {
      const o = blocks[j];
      if (o.t.atF < b.t.untilF && b.t.atF < o.t.untilF) off = Math.max(off, offs[j] + o.h + gap);
    }
    offs.push(off);
  });
  const extent = Math.max(0, ...blocks.map((b, i) => offs[i] + b.h));
  const bandH = band.bottom - band.top;
  let top = pos === "top" ? band.top : band.top + bandH * CENTRE[pos] - extent / 2;
  top = Math.max(band.top, Math.min(top, band.bottom - extent));
  return { offs, extent, top };
};

/** tone of the plate behind band [y0, y1]; `photo` = it is a picture (busy), not a flat fill */
const resolveTone = (seg: NSegment, edl: NEdl, info: ImageInfo | null, y0: number, y1: number): { tone: Tone; photo: boolean } => {
  const s = seg.tone;
  if (s.kind === "solid") return { tone: s.light ? "light" : "dark", photo: false };
  if (s.kind === "image" && info)
    return { tone: bandLuminance(info, s.fit, edl.W, edl.H, y0, y1, s.bgLight === true ? 0.9 : 0.1) > 0.6 ? "light" : "dark", photo: true };
  return { tone: "dark", photo: true };
};

type Group = Laid & { pos: TextPosition; tone: Tone; photo: boolean; blocks: Block[]; k: number };
const POSITIONS: TextPosition[] = ["top", "upper_third", "center", "lower_third"];

const layoutSegment = (seg: NSegment, edl: NEdl, info: ImageInfo | null): Group[] => {
  const maxW = edl.W - 2 * edl.safe.side;
  const bandH = edl.band.bottom - edl.band.top;
  const groups: Group[] = [];
  for (const pos of POSITIONS) {
    const ts = seg.texts.filter((t) => t.position === pos);
    if (!ts.length) continue;
    const build = (tone: Tone, k: number) => ts.map((t) => buildBlock(t, tone, k, maxW, edl));
    let k = edl.k;
    let blocks = build("dark", k);
    let lay = stack(blocks, pos, edl.band, 18 * k);
    for (let i = 0; i < 4 && lay.extent > bandH; i++) {
      k *= (bandH / lay.extent) * 0.98;
      blocks = build("dark", k);
      lay = stack(blocks, pos, edl.band, 18 * k);
    }
    const { tone, photo } = resolveTone(seg, edl, info, lay.top, lay.top + lay.extent);
    if (tone === "light") {
      blocks = build("light", k);
      lay = stack(blocks, pos, edl.band, 18 * k);
    }
    groups.push({ ...lay, pos, tone, photo, blocks, k });
  }
  return groups;
};

const envelopeOf = (t: NText, seg: NSegment, edl: NEdl, f: number, fps: number, still: boolean, k: number): Env => {
  // a text that is on at the very first frame of the ad is fully there at frame 0 (thumbnail / loop point)
  const first = seg.from + t.atF === 0;
  const base = { f, fps, still, first };
  if (f < t.atF || f >= t.untilF) return { ...base, o: 0, y: 0, blur: 0 };
  if (still) return { ...base, o: 1, y: 0, blur: 0 };
  const s = first ? 1 : rise(f, fps, t.atF, 16);
  const endsAtEnd = seg.from + t.untilF >= edl.duration;
  const out = endsAtEnd ? 1 : interpolate(f, [t.untilF - 7, t.untilF - 1], [1, 0], clamp);
  return { ...base, o: s * out, y: (1 - s) * 16 * k, blur: (1 - s) * 5 };
};

export const SegmentTexts: React.FC<{ seg: NSegment }> = ({ seg }) => {
  const edl = useEdl();
  const still = useStill();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const info = useImageInfo(seg.tone.kind === "image" ? seg.tone.src : null);
  const waiting = seg.tone.kind === "image" && !info;
  const groups = useMemo(() => (waiting ? [] : layoutSegment(seg, edl, info)), [seg, edl, info, waiting]);
  const maxW = edl.W - 2 * edl.safe.side;
  return (
    <>
      {groups.map((g) => {
        const envs = g.blocks.map((b) => envelopeOf(b.t, seg, edl, f, fps, still, g.k));
        // soft veil behind un-boxed text: dark under white text, paper under ink text on a (busy) light photo
        const veil = g.tone === "dark" ? (a: number) => `rgba(0,0,0,${a})` : g.photo ? (a: number) => rgba(edl.theme.paper, a) : null;
        const peak = g.tone === "dark" ? 0.34 : 0.62;
        const scrim = veil ? Math.max(0, ...g.blocks.map((b, i) => (b.boxed ? 0 : envs[i].o))) : 0;
        return (
          <React.Fragment key={g.pos}>
            {scrim > 0.001 ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: g.top - 120 * g.k,
                  height: g.extent + 240 * g.k,
                  opacity: scrim,
                  background: veil ? `linear-gradient(180deg, ${veil(0)} 0%, ${veil(peak)} 30%, ${veil(peak)} 70%, ${veil(0)} 100%)` : undefined,
                }}
              />
            ) : null}
            {g.blocks.map((b, i) => {
              const env = envs[i];
              if (env.o <= 0.001) return null;
              const left = b.align === "center" ? edl.safe.side : edl.rtl ? edl.W - edl.safe.side - b.w : edl.safe.side;
              return (
                <div
                  key={b.t.key}
                  data-lab-text={b.t.slot || b.t.style}
                  style={{
                    position: "absolute",
                    left,
                    top: g.top + g.offs[i],
                    width: b.align === "center" ? maxW : b.w,
                    height: b.h,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "flex-start",
                    fontFamily: cairo,
                    opacity: env.o,
                    transform: env.y > 0.01 ? `translateY(${env.y.toFixed(2)}px)` : undefined,
                    filter: env.blur > 0.05 ? `blur(${env.blur.toFixed(2)}px)` : undefined,
                  }}
                >
                  {b.draw(env)}
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </>
  );
};

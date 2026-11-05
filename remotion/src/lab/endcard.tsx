import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { cairo } from "../sirine/font";
import { clamp, prog, rise, useEdl, useStill } from "./context";
import { fitText, parsePrice, textWidth } from "./measure";
import { END_IN } from "./normalize";
import { Struck } from "./rail";

// ─────────────────────────────────────────────────────────────────────────────
// Brand end card (house DjineAiEndCard): solid ink ground, one centred stack —
//   SIRINE wordmark (TEXT, never an image) · name · hairline · struck former price ·
//   PRICE currency · any extra lines (cod/delivery…) · CTA pill · site · phone
// Lines are picked by slot; unknown slots become extra info lines (in EDL order).
// Every row is measured and fitted to the side margins, and the whole stack is scaled
// and clamped into the safe band (9:16 → Reels-safe 270–1250). Prices pinned LTR.
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN = new Set(["name", "price", "strike", "cta", "site", "phone", "brand", "wordmark"]);
const isLatin = (s: string) => /^[\x20-\x7E]+$/.test(s);

type Row = { key: string; h: number; mt: number; at: number; node: (o: { f: number; still: boolean }) => React.ReactNode };

const buildRows = (lines: { slot: string; text: string }[], k: number, maxW: number, theme: { paper: string; smoke: string; ink: string }): Row[] => {
  const get = (slot: string) => lines.find((l) => l.slot === slot)?.text;
  const rows: Row[] = [];
  const word = get("wordmark") ?? get("brand") ?? "SIRINE";
  const wordLatin = isLatin(word);
  const wSize = 32 * k;
  const wSpace = wordLatin ? 13 * k : 0;
  const wScale = Math.min(1, maxW / Math.max(1, textWidth(word, wSize, 700, wSpace)));
  rows.push({
    key: "wordmark",
    h: wSize * wScale * 1.5,
    mt: 0,
    at: 2,
    node: () => (
      <div style={{ fontSize: wSize * wScale, fontWeight: 700, letterSpacing: wSpace * wScale, lineHeight: 1.5, color: theme.smoke, direction: wordLatin ? "ltr" : undefined, whiteSpace: "nowrap", paddingLeft: wSpace * wScale }}>
        {word}
      </div>
    ),
  });

  const name = get("name");
  if (name) {
    const fit = fitText(name, { base: 124 * k, maxW, weight: 900, maxLines: 2 });
    const lh = fit.size * 1.2;
    rows.push({
      key: "name",
      h: fit.lines.length * lh,
      mt: 10 * k,
      at: 5,
      node: () => (
        <div style={{ fontSize: fit.size, fontWeight: 900, lineHeight: `${lh}px`, color: theme.paper, textAlign: "center" }}>
          {fit.lines.map((l, i) => (
            <div key={i} style={{ whiteSpace: "nowrap" }}>
              {l}
            </div>
          ))}
        </div>
      ),
    });
  }

  const price = get("price");
  const strike = get("strike");
  if (price || strike) {
    rows.push({ key: "rule", h: 2, mt: 22 * k, at: 9, node: () => <div style={{ width: 140 * k, height: 2, background: theme.paper, opacity: 0.28 }} /> });
  }
  if (strike) {
    const sp = parsePrice(strike);
    const size0 = 52 * k;
    const w0 = textWidth(strike, size0, 700);
    const size = Math.min(size0, (size0 * maxW) / Math.max(1, w0));
    rows.push({
      key: "strike",
      h: size * 1.2,
      mt: 16 * k,
      at: 9,
      node: ({ f, still }) => (
        <div style={{ height: size * 1.2, display: "flex", alignItems: "center" }}>
          <Struck text={sp ? (sp.currencyFirst ? `${sp.currency} ${sp.amount}` : `${sp.amount} ${sp.currency}`).trim() : strike} size={size} color={theme.smoke} draw={still ? 1 : interpolate(f, [16, 30], [0, 1], clamp)} thickness={Math.max(3, 4 * k)} />
        </div>
      ),
    });
  }
  if (price) {
    const pp = parsePrice(price);
    const a0 = 168 * k;
    const c0 = 86 * k;
    const g0 = 18 * k;
    const w0 = pp ? textWidth(pp.amount, a0, 900, -2) + (pp.currency ? g0 + textWidth(pp.currency, c0, 900) : 0) : textWidth(price, c0, 900);
    const s = Math.min(1, maxW / Math.max(1, w0));
    rows.push({
      key: "price",
      h: a0 * s * 1.08,
      mt: strike ? 4 * k : 16 * k,
      at: 9,
      node: () =>
        pp ? (
          <div style={{ display: "flex", direction: "ltr", alignItems: "baseline", gap: g0 * s, color: "#FFFFFF", lineHeight: 1.08, whiteSpace: "nowrap" }}>
            {pp.currencyFirst && pp.currency ? <span style={{ fontSize: c0 * s, fontWeight: 900 }}>{pp.currency}</span> : null}
            <span style={{ fontSize: a0 * s, fontWeight: 900, letterSpacing: -2 }}>{pp.amount}</span>
            {!pp.currencyFirst && pp.currency ? <span style={{ fontSize: c0 * s, fontWeight: 900 }}>{pp.currency}</span> : null}
          </div>
        ) : (
          <div style={{ fontSize: c0 * s, fontWeight: 900, color: "#FFFFFF", whiteSpace: "nowrap" }}>{price}</div>
        ),
    });
  }

  lines
    .filter((l) => !KNOWN.has(l.slot))
    .forEach((l, i) => {
      const fit = fitText(l.text, { base: 42 * k, maxW, weight: 700, maxLines: 2 });
      const lh = fit.size * 1.4;
      rows.push({
        key: `x${i}`,
        h: fit.lines.length * lh,
        mt: i === 0 ? 24 * k : 6 * k,
        at: 14,
        node: () => (
          <div style={{ fontSize: fit.size, fontWeight: 700, lineHeight: `${lh}px`, color: theme.paper, opacity: 0.92, textAlign: "center" }}>
            {fit.lines.map((x, j) => (
              <div key={j} style={{ whiteSpace: "nowrap" }}>
                {x}
              </div>
            ))}
          </div>
        ),
      });
    });

  const cta = get("cta");
  if (cta) {
    const padX = 72 * k;
    const fit = fitText(cta, { base: 60 * k, maxW: maxW - 2 * padX, weight: 900, maxLines: 1 });
    const boxH = fit.size * 1.5 + 30 * k;
    rows.push({
      key: "cta",
      h: boxH,
      mt: 46 * k,
      at: 19,
      node: ({ f, still }) => (
        <div
          style={{
            height: boxH,
            lineHeight: `${boxH}px`,
            padding: `0 ${padX}px`,
            borderRadius: 999,
            background: theme.paper,
            color: theme.ink,
            fontSize: fit.size,
            fontWeight: 900,
            whiteSpace: "nowrap",
            boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
            transform: still ? undefined : `scale(${interpolate(f, [46, 58, 70], [1, 1.035, 1], clamp).toFixed(4)})`,
          }}
        >
          {fit.lines[0]}
        </div>
      ),
    });
  }

  (["site", "phone"] as const).forEach((slot, i) => {
    const text = get(slot);
    if (!text) return;
    const size0 = 34 * k;
    const sp = isLatin(text) ? 1.5 * k : 0;
    const size = Math.min(size0, (size0 * maxW) / Math.max(1, textWidth(text, size0, 600, sp)));
    rows.push({
      key: slot,
      h: size * 1.5,
      mt: i === 0 || !get("site") ? 22 * k : 2 * k,
      at: 22,
      node: () => (
        <div style={{ fontSize: size, fontWeight: 600, letterSpacing: sp, lineHeight: 1.5, color: theme.smoke, direction: "ltr", unicodeBidi: "isolate", whiteSpace: "nowrap" }}>
          {text}
        </div>
      ),
    });
  });
  return rows;
};

export const EndCard: React.FC = () => {
  const edl = useEdl();
  const e = edl.endCard!;
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const still = useStill();
  const { W, H, theme, safe, tall } = edl;
  const maxW = W - 2 * safe.side;
  const bandH = safe.bottom - safe.top;

  let k = edl.k * (tall ? 1 : 0.94);
  let rows = buildRows(e.lines, k, maxW, theme);
  let total = rows.reduce((a, r) => a + r.h + r.mt, 0);
  for (let i = 0; i < 3 && total > bandH * 0.96; i++) {
    k *= ((bandH * 0.96) / total) * 0.99;
    rows = buildRows(e.lines, k, maxW, theme);
    total = rows.reduce((a, r) => a + r.h + r.mt, 0);
  }
  const centreY = tall ? H * 0.43 : H * 0.5;
  const top = Math.max(safe.top, Math.min(centreY - total / 2, safe.bottom - total));
  const ground = still ? 1 : prog(f, 0, END_IN);

  return (
    <AbsoluteFill style={{ opacity: ground }}>
      <AbsoluteFill style={{ backgroundColor: theme.ink }} />
      <AbsoluteFill style={{ background: `radial-gradient(90% 60% at 50% ${(((top + total / 2) / H) * 100).toFixed(1)}%, #1A1A1E 0%, ${theme.ink} 70%)` }} />
      <div style={{ position: "absolute", top, left: safe.side, width: maxW, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: cairo }}>
        {rows.map((r) => {
          const s = still ? 1 : rise(f, fps, r.at, 26);
          return (
            <div key={r.key} style={{ height: r.h, marginTop: r.mt, display: "flex", alignItems: "center", justifyContent: "center", opacity: s, transform: s < 0.999 ? `translateY(${((1 - s) * 34 * k).toFixed(2)}px)` : undefined }}>
              {r.node({ f, still })}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

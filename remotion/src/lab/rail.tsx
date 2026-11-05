import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { cairo } from "../sirine/font";
import { clamp, rise, useEdl, useStill } from "./context";
import { parsePrice, textWidth } from "./measure";
import { END_IN } from "./normalize";

// ─────────────────────────────────────────────────────────────────────────────
// Persistent offer rail (house OfferRail): one ink capsule at rail.y / rail.h —
//   [ strike (drawn line) · PRICE currency ] | cod/delivery | any other item
// The price row is pinned LTR so digits and «دج» never reorder; the strike is a drawn
// line, not a font feature. On at frame 0 when fromFrame = 0 (COD rule: price + COD
// legible from the first frame), fades out under the end card. On 9:16 the capsule
// stays left of x≈930 (the Reels like/comment/share column).
// ─────────────────────────────────────────────────────────────────────────────

const PANEL = "rgba(12,12,12,0.86)";
const HAIR = "1px solid rgba(255,255,255,0.20)";

const OneShine: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  if (f < at || f > at + 26) return null;
  const x = interpolate(f, [at, at + 26], [-40, 140], clamp);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "inherit", pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: "-30%", bottom: "-30%", left: `${x}%`, width: "18%", transform: "rotate(16deg)", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.30), transparent)" }} />
    </div>
  );
};

export const Struck: React.FC<{ text: string; size: number; color: string; weight?: 700 | 900; draw?: number; thickness?: number }> = ({ text, size, color, weight = 700, draw = 1, thickness }) => (
  <span style={{ position: "relative", display: "inline-block", fontSize: size, fontWeight: weight, lineHeight: 1, color, direction: "ltr", unicodeBidi: "isolate", whiteSpace: "nowrap" }}>
    {text}
    <span
      style={{
        position: "absolute",
        left: -size * 0.08,
        right: -size * 0.08,
        top: "52%",
        height: thickness ?? Math.max(2, size * 0.08),
        marginTop: -(thickness ?? Math.max(2, size * 0.08)) / 2,
        background: color,
        borderRadius: 2,
        transform: `scaleX(${draw})`,
        transformOrigin: "0 50%",
      }}
    />
  </span>
);

export const Rail: React.FC = () => {
  const edl = useEdl();
  const r = edl.rail!;
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const still = useStill();
  const abs = f + r.from;

  const appear = still || r.from === 0 ? 1 : rise(f, fps, 0, 14);
  const fade = still || r.fadeAt === null ? 1 : interpolate(abs, [r.fadeAt, r.fadeAt + END_IN], [1, 0], clamp);

  const x0 = edl.safe.side;
  const x1 = edl.tall ? Math.min(edl.W - edl.safe.side, Math.round(930 * (edl.W / 1080))) : edl.W - edl.safe.side;
  const maxW = x1 - x0;

  const price = r.items.find((i) => i.slot === "price");
  const strike = r.items.find((i) => i.slot === "strike");
  const rest = r.items.filter((i) => i !== price && i !== strike);
  const pp = price ? parsePrice(price.text) : null;

  // sizes at scale 1 (house rail: h 86 → price 60 / currency 34 / strike 30 / cod 33)
  const u = r.h / 86;
  const S = { amount: 60 * u, cur: 34 * u, strike: 30 * u, rest: 33 * u, padX: 34 * u, gap: 22 * u, inner: 12 * u };
  const priceRowW =
    (strike ? textWidth(strike.text, S.strike, 700) + S.strike * 0.16 + S.inner : 0) +
    (price ? (pp ? textWidth(pp.amount, S.amount, 900, -1) + (pp.currency ? S.inner + textWidth(pp.currency, S.cur, 900) : 0) : textWidth(price.text, S.cur, 900)) : 0);
  const restW = rest.reduce((a, it) => a + textWidth(it.text, S.rest, 700), 0);
  const dividers = (price || strike ? 1 : 0) + rest.length - 1;
  const full = 2 * S.padX + priceRowW + restW + Math.max(0, dividers) * (2 * S.gap + 1) + 2;
  const s = Math.min(1, maxW / full);

  const opacity = appear * fade;
  if (opacity <= 0.001) return null;
  const items: React.ReactNode[] = [];
  if (price || strike) {
    items.push(
      <div key="price" style={{ display: "flex", direction: "ltr", alignItems: "baseline", gap: S.inner * s }}>
        {strike ? <Struck text={strike.text} size={S.strike * s} color={edl.theme.smoke} /> : null}
        {price && pp ? (
          <>
            <span style={{ fontSize: S.amount * s, fontWeight: 900, lineHeight: 1, letterSpacing: -1 }}>{pp.amount}</span>
            {pp.currency ? <span style={{ fontSize: S.cur * s, fontWeight: 900, lineHeight: 1 }}>{pp.currency}</span> : null}
          </>
        ) : price ? (
          <span style={{ fontSize: S.cur * s, fontWeight: 900, lineHeight: 1 }}>{price.text}</span>
        ) : null}
      </div>,
    );
  }
  rest.forEach((it, i) => {
    if (items.length) items.push(<div key={`d${i}`} style={{ width: 1, height: r.h * 0.5, flex: "none", background: "rgba(255,255,255,0.30)" }} />);
    items.push(
      <span key={`r${i}`} style={{ fontSize: S.rest * s, fontWeight: 700, lineHeight: 1.1, opacity: 0.95, paddingBottom: 2 * u }}>
        {it.text}
      </span>,
    );
  });

  return (
    <div
      style={{
        position: "absolute",
        top: r.y,
        left: x0,
        width: maxW,
        height: r.h,
        display: "flex",
        justifyContent: "center",
        opacity,
        transform: appear < 0.999 ? `translateY(${((1 - appear) * 12 * u).toFixed(2)}px)` : undefined,
      }}
    >
      <div
        style={{
          position: "relative",
          height: r.h,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: S.gap * s,
          direction: edl.dir,
          padding: `0 ${S.padX * s}px`,
          borderRadius: 999,
          background: PANEL,
          border: HAIR,
          boxShadow: "0 14px 40px rgba(0,0,0,0.30)",
          fontFamily: cairo,
          color: "#FFFFFF",
          whiteSpace: "nowrap",
        }}
      >
        {items}
        {still ? null : <OneShine at={36} />}
      </div>
    </div>
  );
};

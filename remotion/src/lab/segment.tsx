import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { bell, clamp, prog, travel, useEdl, useStill } from "./context";
import { Layer } from "./layers";
import type { NSegment } from "./normalize";

// ─────────────────────────────────────────────────────────────────────────────
// One segment's PICTURE (texts live in a separate layer above every picture).
// transitionIn occupies the incoming segment's first `frames`; the outgoing segment
// stays mounted underneath for that window (normalize.ts extends its life), so the
// transition always overlaps the previous segment's tail. Pictures only — text is
// never inside a transitioning box, and nothing is clip-path/mask wiped.
//   cut   — nothing
//   fade  — incoming opacity 0→1 over the held outgoing picture
//   push  — both pictures travel together along `dir`, with a directional motion blur
//   slide — incoming slides over; outgoing drifts 28 % and dims (parallax), soft edge shadow
//   zoom  — zoom-through: outgoing scales up + blurs, incoming settles 1.18→1 out of a blur
// ─────────────────────────────────────────────────────────────────────────────

const DirBlur: React.FC<{ id: string; x: number; y: number }> = ({ id, x, y }) => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <filter id={id} x="-15%" y="-15%" width="130%" height="130%">
      <feGaussianBlur stdDeviation={`${x.toFixed(2)} ${y.toFixed(2)}`} />
    </filter>
  </svg>
);

export const SegmentPicture: React.FC<{ seg: NSegment }> = ({ seg }) => {
  const f = useCurrentFrame();
  const still = useStill();
  const { W, H } = useEdl();
  const t = interpolate(f, [0, Math.max(1, seg.life - 1)], [0, 1], clamp);

  const style: React.CSSProperties = {};
  const tf: string[] = [];
  const filters: string[] = [];
  let blur: { id: string; x: number; y: number } | null = null;

  const tin = seg.tin;
  if (!still && tin.kind !== "cut" && f < tin.frames) {
    const d = tin.frames;
    const p = prog(f, 0, d);
    const b = bell(f, 0, d);
    const [sx, sy] = travel(tin.dir);
    switch (tin.kind) {
      case "fade":
        style.opacity = p;
        break;
      case "push":
        tf.push(`translate(${(sx * (1 - p) * W).toFixed(1)}px, ${(sy * (1 - p) * H).toFixed(1)}px)`);
        blur = { id: `lab-in-${seg.index}`, x: sx ? 34 * b : 0, y: sy ? 34 * b : 0 };
        break;
      case "slide":
        tf.push(`translate(${(sx * (1 - p) * W).toFixed(1)}px, ${(sy * (1 - p) * H).toFixed(1)}px)`);
        style.boxShadow = `0 0 90px rgba(0,0,0,${(0.5 * b).toFixed(3)})`;
        break;
      case "zoom":
        // settles DOWN from 1.18: a plate scaled below 1 would show a band of the outgoing shot at its edges
        style.opacity = prog(f, d * 0.2, d * 0.8);
        tf.push(`scale(${(1.18 - 0.18 * p).toFixed(4)})`);
        filters.push(`blur(${(8 * (1 - p)).toFixed(2)}px)`);
        break;
    }
  }

  const out = seg.out;
  if (!still && out && f >= out.start) {
    const a = out.start;
    const d = out.frames;
    const q = prog(f, a, a + d);
    const b = bell(f, a, a + d);
    const [sx, sy] = travel(out.dir);
    switch (out.kind) {
      case "push":
        tf.push(`translate(${(-sx * q * W).toFixed(1)}px, ${(-sy * q * H).toFixed(1)}px)`);
        blur = { id: `lab-out-${seg.index}`, x: sx ? 34 * b : 0, y: sy ? 34 * b : 0 };
        break;
      case "slide":
        tf.push(`translate(${(-sx * q * W * 0.28).toFixed(1)}px, ${(-sy * q * H * 0.28).toFixed(1)}px)`);
        filters.push(`brightness(${(1 - 0.35 * q).toFixed(3)})`);
        break;
      case "zoom":
        tf.push(`scale(${(1 + 0.6 * q).toFixed(4)})`);
        filters.push(`blur(${(16 * q).toFixed(2)}px)`);
        break;
      default:
        break; // fade / cut: the outgoing picture just holds
    }
  }
  if (blur && (blur.x > 0.05 || blur.y > 0.05)) filters.push(`url(#${blur.id})`);
  else blur = null;

  return (
    <AbsoluteFill>
      {blur ? <DirBlur id={blur.id} x={blur.x} y={blur.y} /> : null}
      <AbsoluteFill
        style={{
          ...style,
          overflow: "hidden",
          transform: tf.length ? tf.join(" ") : undefined,
          filter: filters.length ? filters.join(" ") : undefined,
        }}
      >
        {seg.layers.map((l, i) => (
          <Layer key={i} l={l} t={t} />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, staticFile } from "remotion";
import { useImageInfo } from "./analyze";
import { useEdl } from "./context";
import type { NLayer, NMotion } from "./normalize";

// ─────────────────────────────────────────────────────────────────────────────
// Picture layers, bottom → top. `t` is 0→1 across the segment's mounted life
// (including the tail held under the next transition), so a push-in never stalls
// mid-transition and a pan never runs past its overscan.
// Video is MUTED: the only sound is the optional bed (no audio events at cuts),
// and it is never stretched with playbackRate (compositor "No frame found") — trim only.
// ─────────────────────────────────────────────────────────────────────────────

/** `full` = the layer fills the frame, so pans need overscan (scale) to never show an edge. */
export const motionTransform = (m: NMotion, t: number, W: number, full: boolean): string | undefined => {
  if (m.type === "none" || m.amount <= 0) return undefined;
  const a = m.amount;
  switch (m.type) {
    case "push_in":
      return `scale(${(1 + a * t).toFixed(5)})`;
    case "pull_out":
      return `scale(${(1 + a * (1 - t)).toFixed(5)})`;
    case "pan_left":
    case "pan_right": {
      const dx = (m.type === "pan_left" ? 1 : -1) * (0.5 - t) * a * W;
      return full ? `translateX(${dx.toFixed(2)}px) scale(${(1 + a).toFixed(5)})` : `translateX(${dx.toFixed(2)}px)`;
    }
    default:
      return undefined;
  }
};

const FillLayer: React.FC<{ color: string }> = ({ color }) => <AbsoluteFill style={{ backgroundColor: color }} />;

const ImageLayer: React.FC<{ l: Extract<NLayer, { kind: "image" }>; t: number }> = ({ l, t }) => {
  const { W } = useEdl();
  return (
    <AbsoluteFill style={{ backgroundColor: l.bg ?? undefined, overflow: "hidden" }}>
      <Img
        src={staticFile(l.src)}
        style={{ width: "100%", height: "100%", objectFit: l.fit, transform: motionTransform(l.motion, t, W, true), transformOrigin: "50% 50%" }}
      />
    </AbsoluteFill>
  );
};

const VideoLayer: React.FC<{ l: Extract<NLayer, { kind: "video" }>; t: number }> = ({ l, t }) => {
  const { W } = useEdl();
  return (
    <AbsoluteFill style={{ backgroundColor: l.bg ?? undefined, overflow: "hidden" }}>
      <OffthreadVideo
        src={staticFile(l.src)}
        muted
        trimBefore={l.trimBefore > 0 ? l.trimBefore : undefined}
        style={{ width: "100%", height: "100%", objectFit: l.fit, transform: motionTransform(l.motion, t, W, true), transformOrigin: "50% 50%" }}
      />
    </AbsoluteFill>
  );
};

// Soft contact shadow = two blurred ellipses in MULTIPLY under the product's base:
// a wide ambient one and a tight dark core. They are siblings of the product (not inside its
// transformed box) so multiply blends with the plate underneath instead of an isolated group.
const ContactShadow: React.FC<{ cx: number; cy: number; pw: number; tf?: string }> = ({ cx, cy, pw, tf }) => {
  const base: React.CSSProperties = { position: "absolute", borderRadius: "50%", mixBlendMode: "multiply", transformOrigin: "50% 50%", transform: tf };
  const aw = pw * 0.92;
  const ah = Math.max(10, pw * 0.11);
  const cw = pw * 0.68;
  const ch = Math.max(4, pw * 0.034);
  return (
    <>
      <div style={{ ...base, left: cx - aw / 2, top: cy - ah / 2, width: aw, height: ah, background: "rgba(0,0,0,0.30)", filter: `blur(${(pw * 0.045).toFixed(1)}px)` }} />
      <div style={{ ...base, left: cx - cw / 2, top: cy - ch / 2, width: cw, height: ch, background: "rgba(0,0,0,0.45)", filter: `blur(${Math.max(2, pw * 0.012).toFixed(1)}px)` }} />
    </>
  );
};

// A transparent PNG fitted by its ALPHA bounding box into `box` (contain, bottom-centred so it
// stands on its shadow). Motion scales/pans around the base point, shadow included.
const CutoutLayer: React.FC<{ l: Extract<NLayer, { kind: "cutout" }>; t: number }> = ({ l, t }) => {
  const { W, H } = useEdl();
  const info = useImageInfo(l.src);
  if (!info) return null;
  const bx = l.box.x * W;
  const by = l.box.y * H;
  const bw = l.box.w * W;
  const bh = l.box.h * H;
  const pw0 = info.bbox.w * info.w;
  const ph0 = info.bbox.h * info.h;
  const s = Math.min(bw / pw0, bh / ph0);
  const pw = pw0 * s;
  const ph = ph0 * s;
  const px = bx + (bw - pw) / 2;
  const py = by + bh - ph;
  const tf = motionTransform(l.motion, t, W, false);
  return (
    <AbsoluteFill>
      {l.shadow ? <ContactShadow cx={px + pw / 2} cy={py + ph} pw={pw} tf={tf} /> : null}
      {/* no overflow clip: the bbox comes from a 256 px thumbnail, faint edge pixels may sit just outside it */}
      <div style={{ position: "absolute", left: px, top: py, width: pw, height: ph, transform: tf, transformOrigin: "50% 100%" }}>
        <Img
          src={staticFile(l.src)}
          style={{ position: "absolute", left: -info.bbox.x * info.w * s, top: -info.bbox.y * info.h * s, width: info.w * s, height: info.h * s, maxWidth: "none" }}
        />
      </div>
    </AbsoluteFill>
  );
};

export const Layer: React.FC<{ l: NLayer; t: number }> = ({ l, t }) => {
  switch (l.kind) {
    case "fill":
      return <FillLayer color={l.color} />;
    case "image":
      return <ImageLayer l={l} t={t} />;
    case "video":
      return <VideoLayer l={l} t={t} />;
    case "cutout":
      return <CutoutLayer l={l} t={t} />;
  }
};

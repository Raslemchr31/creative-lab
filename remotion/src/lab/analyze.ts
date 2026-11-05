import { useEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

// ─────────────────────────────────────────────────────────────────────────────
// One cheap look at an image (downscaled to ≤256 px on a canvas):
//   • bbox  — alpha bounding box, so a cut-out PNG that still carries transparent
//             padding (remove-background output keeps the source canvas) is fitted
//             by its PRODUCT, and its contact shadow lands under the product;
//   • bands — mean luminance of 20 horizontal bands (centre 80 % of the width),
//             so text over a light studio photo turns ink instead of white.
// Same-origin (staticFile) → no canvas taint. A load failure fails the render.
// ─────────────────────────────────────────────────────────────────────────────

export type ImageInfo = {
  w: number;
  h: number;
  /** normalised 0..1 of the image */
  bbox: { x: number; y: number; w: number; h: number };
  bands: number[];
};

export const BANDS = 20;
const pending = new Map<string, Promise<ImageInfo>>();
const done = new Map<string, ImageInfo>();

const analyse = async (url: string): Promise<ImageInfo> => {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new Error(`lab: could not load image ${url} (check the EDL src — paths are relative to public/)`);
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const sc = Math.min(1, 256 / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * sc));
  const ch = Math.max(1, Math.round(h * sc));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("lab: no 2D canvas for image analysis");
  g.drawImage(img, 0, 0, cw, ch);
  const d = g.getImageData(0, 0, cw, ch).data;
  let minX = cw;
  let minY = ch;
  let maxX = -1;
  let maxY = -1;
  const sum = new Array<number>(BANDS).fill(0);
  const wsum = new Array<number>(BANDS).fill(0);
  const x0 = Math.floor(cw * 0.1);
  const x1 = Math.ceil(cw * 0.9);
  for (let y = 0; y < ch; y++) {
    const band = Math.min(BANDS - 1, Math.floor((y / ch) * BANDS));
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      const a = d[i + 3];
      if (a > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (x >= x0 && x < x1 && a > 0) {
        const wa = a / 255;
        sum[band] += ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255) * wa;
        wsum[band] += wa;
      }
    }
  }
  const bbox = maxX < 0 ? { x: 0, y: 0, w: 1, h: 1 } : { x: minX / cw, y: minY / ch, w: (maxX + 1 - minX) / cw, h: (maxY + 1 - minY) / ch };
  return { w, h, bbox, bands: sum.map((s, i) => (wsum[i] > 0 ? s / wsum[i] : 0)) };
};

export const analyseImage = (src: string): Promise<ImageInfo> => {
  const url = staticFile(src);
  let p = pending.get(url);
  if (!p) {
    p = analyse(url).then((info) => {
      done.set(url, info);
      return info;
    });
    pending.set(url, p);
  }
  return p;
};

/** ImageInfo for `src` (public-relative), holding the frame with delayRender until it is known. */
export const useImageInfo = (src: string | null): ImageInfo | null => {
  const url = src ? staticFile(src) : null;
  const [info, setInfo] = useState<ImageInfo | null>(() => (url ? (done.get(url) ?? null) : null));
  const handle = useRef<number | null>(null);
  if (url && !info && handle.current === null) handle.current = delayRender(`lab: analysing ${src}`);
  useEffect(() => {
    if (!src || info) return;
    let alive = true;
    analyseImage(src)
      .then((i) => {
        if (alive) setInfo(i);
      })
      .catch((err: unknown) => cancelRender(err instanceof Error ? err : new Error(String(err))));
    return () => {
      alive = false;
    };
  }, [src, info]);
  useEffect(() => {
    if (info && handle.current !== null) {
      continueRender(handle.current);
      handle.current = null;
    }
  }, [info]);
  useEffect(
    () => () => {
      if (handle.current !== null) {
        continueRender(handle.current);
        handle.current = null;
      }
    },
    [],
  );
  return info;
};

/**
 * Mean luminance of the picture behind the frame band [y0, y1] for an image shown with
 * object-fit cover|contain on a W×H frame. Rows outside a contained image use `outside`.
 */
export const bandLuminance = (info: ImageInfo, fit: "cover" | "contain", W: number, H: number, y0: number, y1: number, outside: number): number => {
  const s = fit === "cover" ? Math.max(W / info.w, H / info.h) : Math.min(W / info.w, H / info.h);
  const dispH = info.h * s;
  const offY = (H - dispH) / 2;
  let acc = 0;
  let n = 0;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps;
    const iy = (y - offY) / dispH;
    acc += iy < 0 || iy >= 1 ? outside : info.bands[Math.min(BANDS - 1, Math.floor(iy * BANDS))];
    n++;
  }
  return acc / n;
};

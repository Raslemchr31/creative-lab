// creative-lab :: still-image compositing with ImageMagick 7 (argv arrays only).
// Implements the L1/L2 recipe from research/04 §3.5: real cut-out on a plate with a contact
// shadow, paste-back after AI harmonising, aspect fitting, region crops, PHASH + ΔE00 checks.

import fs from "node:fs";
import path from "node:path";
import { runTool, probe } from "./probe.mjs";
import { config, ensureDir } from "./util.mjs";
import { meanLabRGBA, deltaE00 } from "./color.mjs";

const MAGICK = () => config().tools?.magick || "magick";

function magick(args, what) {
  const r = runTool(MAGICK(), args, { timeoutMs: 180000 });
  if (r.code !== 0) throw new Error(`magick ${what} failed: ${(r.stderr || r.stdout).slice(0, 400)}`);
  return r;
}

export const ASPECT_PX = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080], "16:9": [1920, 1080] };

/** Fit an image to an exact aspect: pad (keep everything, fill bg) or crop (cover). */
export function fitToAspect(src, out, { aspect = "9:16", w, h, mode = "pad", bg = "#F4F1EA" } = {}) {
  [w, h] = w && h ? [w, h] : ASPECT_PX[aspect] || ASPECT_PX["9:16"];
  ensureDir(path.dirname(out));
  if (mode === "smart") {
    // Scene/on-model photos: a centre crop to 4:5 from a tall photo cuts the face AND the shoes (the pack
    // must stay whole — owner rule). Crop only when it removes ≤12% of the image; otherwise keep the whole
    // photo and fill the bars with a blurred, darkened cover of the same photo.
    const p = probe(src);
    const sw = p.display_w || p.width;
    const sh = p.display_h || p.height;
    const loss = sw && sh ? 1 - Math.min((sw / sh) / (w / h), (w / h) / (sw / sh)) : 1;
    if (loss <= 0.12) mode = "crop";
    else {
      magick([src, "-auto-orient", "(", "+clone", "-resize", `${w}x${h}^`, "-gravity", "center", "-extent", `${w}x${h}`, "-blur", "0x28", "-modulate", "85", ")", "(", "-clone", "0", "-resize", `${w}x${h}`, ")", "-delete", "0", "-gravity", "center", "-composite", out], "fit-blurpad");
      return out;
    }
  }
  if (mode === "crop") magick([src, "-auto-orient", "-resize", `${w}x${h}^`, "-gravity", "center", "-extent", `${w}x${h}`, out], "fit-crop");
  else magick([src, "-auto-orient", "-resize", `${w}x${h}`, "-background", bg, "-gravity", "center", "-extent", `${w}x${h}`, out], "fit-pad");
  return out;
}

/**
 * Draft cut-out for photos on a plain studio background: flood-fill transparency from the 4 corners
 * (fuzz %), trim, then report alpha coverage. Real production uses recraft/remove-background;
 * this local version is free and good enough on clean catalog shots — QA decides.
 */
export function localCutout(src, out, { fuzz = 10 } = {}) {
  ensureDir(path.dirname(out));
  const p = probe(src);
  const W = p.display_w;
  const H = p.display_h;
  const pts = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]];
  const args = [src, "-auto-orient", "-alpha", "set", "-fuzz", `${fuzz}%`, "-fill", "none"];
  for (const [x, y] of pts) args.push("-draw", `color ${x},${y} floodfill`);
  args.push("-channel", "A", "-morphology", "Erode", "Disk:1", "+channel", "-trim", "+repage", out);
  magick(args, "cutout");
  return { path: out, ...alphaStats(out) };
}

/** Fraction of opaque pixels + bbox size of a PNG with alpha. */
export function alphaStats(file) {
  const r = runTool(MAGICK(), [file, "-alpha", "extract", "-format", "%[fx:mean] %w %h", "info:"], { timeoutMs: 60000 });
  const [mean, w, h] = r.stdout.trim().split(/\s+/).map(Number);
  return { coverage: Number.isFinite(mean) ? Number(mean.toFixed(4)) : null, w, h };
}

/**
 * Place a cut-out inside a normalized box {x,y,w,h} of the plate (contain), with an optional
 * soft contact shadow under it. Returns the pixel placement for paste-back / QA crops.
 */
export function compositeOnPlate({ plate, cutout, out, box = { x: 0.12, y: 0.38, w: 0.76, h: 0.44 }, shadow = true, shadowOpacity = 0.38 }) {
  const P = probe(plate);
  const C = probe(cutout);
  const PW = P.display_w;
  const PH = P.display_h;
  const bw = box.w * PW;
  const bh = box.h * PH;
  const s = Math.min(bw / C.display_w, bh / C.display_h);
  const w = Math.round(C.display_w * s);
  const h = Math.round(C.display_h * s);
  const x = Math.round(box.x * PW + (bw - w) / 2);
  const y = Math.round(box.y * PH + (bh - h) / 2);
  ensureDir(path.dirname(out));
  const args = [plate];
  if (shadow) {
    const cx = x + w / 2;
    const cy = y + h * 0.985;
    const rx = w * 0.42;
    const ry = Math.max(8, h * 0.045);
    args.push("(", "-size", `${PW}x${PH}`, "xc:none", "-fill", `rgba(0,0,0,${shadowOpacity})`, "-draw", `ellipse ${cx.toFixed(1)},${cy.toFixed(1)} ${rx.toFixed(1)},${ry.toFixed(1)} 0,360`, "-blur", `0x${Math.max(6, Math.round(ry))}`, ")", "-compose", "multiply", "-composite");
  }
  args.push("(", cutout, "-resize", `${w}x${h}!`, ")", "-geometry", `+${x}+${y}`, "-compose", "over", "-composite", out);
  magick(args, "composite");
  return { out, placement: { x, y, w, h }, plate: { w: PW, h: PH } };
}

/** Paste the real cut-out back over an AI-harmonised image at the identical transform (L2 sandwich). */
export function pasteBack({ base, cutout, placement, out, size }) {
  ensureDir(path.dirname(out));
  const args = [base];
  if (size) args.push("-resize", `${size.w}x${size.h}!`);
  args.push("(", cutout, "-resize", `${placement.w}x${placement.h}!`, ")", "-geometry", `+${placement.x}+${placement.y}`, "-compose", "over", "-composite", out);
  magick(args, "paste-back");
  return out;
}

export function cropRegion(src, { x, y, w, h }, out) {
  ensureDir(path.dirname(out));
  magick([src, "-crop", `${w}x${h}+${x}+${y}`, "+repage", out], "crop");
  return out;
}

/** Normalised perceptual-hash distance (0 = identical). research/04 §3.5: ≤0.001 proves pixel-lock. */
export function phashDistance(a, b) {
  const r = runTool(MAGICK(), ["compare", "-metric", "PHASH", a, b, "null:"], { timeoutMs: 60000 });
  const txt = `${r.stderr} ${r.stdout}`;
  const m = txt.match(/\(([0-9.eE+-]+)\)/) || txt.match(/^\s*([0-9.eE+-]+)/);
  if (!m) throw new Error(`PHASH compare failed: ${txt.slice(0, 200)}`);
  return Number(m[1]);
}

/** Mean Lab of an image's opaque pixels (alpha-masked), downscaled for speed. Binary-safe RGBA read. */
export async function meanLabAsync(file, { maxSide = 256, minAlpha = 128 } = {}) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(MAGICK(), [file, "-auto-orient", "-resize", `${maxSide}x${maxSide}>`, "-alpha", "on", "-depth", "8", "rgba:-"], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw new Error(`meanLab: ${String(r.stderr).slice(0, 200)}`);
  return meanLabRGBA(r.stdout, minAlpha);
}

/** ΔE00 between the alpha-masked mean colours of two images (e.g. reference cut-out vs output region). */
export async function colourDelta(a, b) {
  const [A, B] = [await meanLabAsync(a), await meanLabAsync(b)];
  if (!A.lab || !B.lab) return null;
  return Number(deltaE00(A.lab, B.lab).toFixed(2));
}

/**
 * Pixel-lock check for a composite/paste-back output (research/04 FR2): crop the product region,
 * apply the real cut-out's alpha as a mask, then compare against the cut-out itself.
 * Returns { phash, dE00, ok } — ok when phash ≤ 0.001 and ΔE00 ≤ 1.5.
 */
export async function pixelLockCheck({ output, cutout, placement, workDir }) {
  ensureDir(workDir);
  const region = cropRegion(output, placement, path.join(workDir, "lock-region.png"));
  const cutR = path.join(workDir, "lock-cutout.png");
  magick([cutout, "-resize", `${placement.w}x${placement.h}!`, cutR], "lock-resize");
  // Binary, eroded mask: anti-aliased edges blend with the plate/shadow by design, so only the
  // product interior is compared (a regenerated or recoloured product still fails).
  const mask = path.join(workDir, "lock-mask.png");
  magick([cutR, "-alpha", "extract", "-threshold", "50%", "-morphology", "Erode", "Disk:3", mask], "lock-mask-build");
  const masked = path.join(workDir, "lock-masked.png");
  magick([region, "-alpha", "off", mask, "-compose", "CopyOpacity", "-composite", masked], "lock-mask");
  const cutM = path.join(workDir, "lock-cut-masked.png");
  magick([cutR, "-alpha", "off", mask, "-compose", "CopyOpacity", "-composite", cutM], "lock-mask-cut");
  // PHASH on both flattened onto the same neutral so background never counts.
  const fa = path.join(workDir, "lock-a.png");
  const fb = path.join(workDir, "lock-b.png");
  magick([masked, "-background", "#808080", "-flatten", fa], "lock-flat-a");
  magick([cutM, "-background", "#808080", "-flatten", fb], "lock-flat-b");
  // Primary metric: fraction of interior pixels that differ by > 3 % (AE with fuzz). PHASH is kept
  // as information only — on near-black products (most SIRINE bags) its hue moments are unstable:
  // a pixel-identical composite measured 0.053 while AE counted 0 differing pixels.
  const ae = runTool(MAGICK(), ["compare", "-metric", "AE", "-fuzz", "3%", fa, fb, "null:"], { timeoutMs: 60000 });
  const diffPx = Number((`${ae.stderr} ${ae.stdout}`.match(/^\s*([0-9.eE+]+)/) || [])[1] || NaN);
  const maskPx = Number(runTool(MAGICK(), [mask, "-format", "%[fx:mean*w*h]", "info:"]).stdout.trim());
  const diffRatio = maskPx > 0 ? diffPx / maskPx : null;
  let phash = null;
  try {
    phash = Number(phashDistance(fa, fb).toFixed(5));
  } catch {}
  const dE00 = await colourDelta(cutR, masked);
  return { diff_ratio: diffRatio === null ? null : Number(diffRatio.toFixed(5)), dE00, phash, ok: diffRatio !== null && diffRatio <= 0.005 && dE00 !== null && dE00 <= 1.5 };
}

/** Classify a reference photo: "packshot" (plain light background corners) vs "scene". */
export function classifyRef(file) {
  const p = probe(file);
  const W = p.display_w;
  const H = p.display_h;
  const s = Math.max(8, Math.round(Math.min(W, H) * 0.03));
  const corners = [[0, 0], [W - s, 0], [0, H - s], [W - s, H - s]];
  const stats = corners.map(([x, y]) => {
    const r = runTool(MAGICK(), [file, "-auto-orient", "-crop", `${s}x${s}+${x}+${y}`, "+repage", "-colorspace", "Gray", "-format", "%[fx:mean] %[fx:standard_deviation]", "info:"], { timeoutMs: 30000 });
    const [mean, sd] = r.stdout.trim().split(/\s+/).map(Number);
    return { mean, sd };
  });
  const plain = stats.every((c) => c.mean > 0.85 && c.sd < 0.03);
  return { kind: plain ? "packshot" : "scene", corners: stats.map((c) => Number(c.mean.toFixed(3))) };
}

export function exists(p) {
  return !!p && fs.existsSync(p);
}

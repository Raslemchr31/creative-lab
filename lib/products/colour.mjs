// creative-lab :: exact product colour, measured from the store photos.
//
// Why: the owner turns one "prompt code" (reference ad + ONE store product) into Google Flow prompts and
// wants every other colourway of that product available as an exact colour description, so the same ad
// can be generated in another colour without uploading every photo. The store swatches
// (product.colors[0].hex) are hand-set approximations (pack-hobo-marron is stored #503A2A, a dark brown,
// but the real bag is a cognac tan), so the colour is measured from the product photos instead.
//
// Method (measurePhotoColour), plain-background packshots only (4 bright flat corners; on-model/scene → null):
//   1. one magick call → ≤192 px RGBA; everything else in JS.
//   2. background = BFS flood from the border (gradient-following, ΔE76 tol) + enclosed bg seen through a
//      handle loop; product mask eroded 2 px (drops anti-aliased edges / contact shadow).
//   3. von Kries white balance to the studio sweep (gain 1–1.6, never darkens) → grey-sweep shoots and
//      white-sweep shoots of the same colourway agree.
//   4. k-means (k=4, Lab). Body cluster = the largest, or — given the store swatch as a prior — the
//      substantial (≥12 %) cluster nearest it (footwear photos are mostly black sole/footbed). Clusters of
//      the same material in shade (ΔE00 ≤ 12) are merged; per-channel MEDIAN Lab is the colour. Gold
//      hardware, white soles, tan handles and patent highlights stay in their own clusters.
//   5. near-neutral darks: 25th-percentile L (the lit half of a black bag is sheen, not colour).
// measureProduct() takes the median across every whole-product packshot of the colourway.
//
// Everything here is SYNCHRONOUS (spawnSync on ImageMagick). colourways() returns a plain array.

import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { get, run } from "../db.mjs";
import { config, pj, j, nowIso, LabError } from "../util.mjs";
import { rgbToLab, hexToLab, deltaE00 } from "../color.mjs";
import { getProduct, listProducts } from "./sync.mjs";
import { familyOf, siblings, loadSpec } from "./spec.mjs";

const MAGICK = () => config().tools?.magick || "magick";
const ALGO_VERSION = 3; // bump to invalidate every cached measurement

const toHex = ([r, g, b]) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const median = (arr) => {
  const s = Float64Array.from(arr).sort();
  const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN;
};

/** Lab → sRGB (inverse of color.mjs rgbToLab; D65). */
export function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const X = inv(fx) * 0.95047;
  const Y = inv(fy);
  const Z = inv(fz) * 1.08883;
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const gam = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  return [gam(R), gam(G), gam(B)].map((v) => Math.max(0, Math.min(255, Math.round(v))));
}

/** Read an image downscaled to ≤side px as raw RGBA (one magick call). */
function readSmall(file, side) {
  const r = spawnSync(MAGICK(), [file, "-auto-orient", "-resize", `${side}x${side}>`, "-alpha", "on", "-depth", "8", "-format", "%w %h\n", "-write", "info:-", "rgba:-"], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) return null;
  const out = r.stdout;
  const nl = out.indexOf(10);
  const [w, h] = out.subarray(0, nl).toString().trim().split(/\s+/).map(Number);
  const buf = out.subarray(nl + 1);
  return w && h && buf.length >= w * h * 4 ? { w, h, buf } : null;
}

function labImage({ w, h, buf }) {
  const lab = new Float64Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const [L, a, b] = rgbToLab(buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2]);
    lab[i * 3] = L;
    lab[i * 3 + 1] = a;
    lab[i * 3 + 2] = b;
  }
  return lab;
}

/** Corner patches: plain light studio background? (same rule as compose.classifyRef, on the small image). */
function cornerCheck(img, lab) {
  const { w, h } = img;
  const s = Math.max(3, Math.round(Math.min(w, h) * 0.04));
  const stats = [[0, 0], [w - s, 0], [0, h - s], [w - s, h - s]].map(([x0, y0]) => {
    const Ls = [];
    for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) Ls.push(lab[(y * w + x) * 3]);
    const m = Ls.reduce((a, b) => a + b, 0) / Ls.length;
    const sd = Math.sqrt(Ls.reduce((a, b) => a + (b - m) ** 2, 0) / Ls.length);
    return { L: m, sd };
  });
  return { packshot: stats.every((c) => c.L > 82 && c.sd < 3.5), corners: stats.map((c) => Number(c.L.toFixed(1))) };
}

/** Plain light studio background? */
export function isPackshot(file, side = 192) {
  const img = readSmall(file, side);
  if (!img) return { packshot: false, corners: [] };
  return cornerCheck(img, labImage(img));
}

/**
 * Background mask: BFS flood from every border pixel that is "background-like" (within tol ΔE76 of the
 * nearest corner's colour), spreading to neighbours within tol of that same seed colour.
 * Then erode the product mask by `erode` px. Returns Uint8Array (1 = product).
 */
function productMask(img, lab, { tol = 7, erode = 2, holes = true } = {}) {
  const { w, h } = img;
  const n = w * h;
  const bg = new Uint8Array(n);
  const seedOf = new Int32Array(n).fill(-1);
  const d = (i, j) => Math.hypot(lab[i * 3] - lab[j * 3], lab[i * 3 + 1] - lab[j * 3 + 1], lab[i * 3 + 2] - lab[j * 3 + 2]);
  const q = [];
  for (let x = 0; x < w; x++) q.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) q.push(y * w, y * w + w - 1);
  for (const i of q) seedOf[i] = i;
  let head = 0;
  const queue = [];
  for (const i of q) if (lab[i * 3] > 70 && !bg[i]) { bg[i] = 1; queue.push(i); }
  while (head < queue.length) {
    const i = queue[head++];
    const s = seedOf[i];
    const x = i % w;
    const y = (i - x) / w;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (bg[j]) continue;
      // Compare to the seed colour AND the current pixel: follows soft studio gradients without leaking.
      if (d(j, s) <= tol * 1.6 && d(j, i) <= tol * 0.45) {
        bg[j] = 1;
        seedOf[j] = s;
        queue.push(j);
      }
    }
  }
  // Enclosed background (seen through a handle loop): pixels anywhere that match the bg colour itself.
  // Skipped when it would eat most of the product (white / off-white products on a white sweep).
  let bgN = 0;
  const ref = [0, 0, 0];
  for (let i = 0; i < n; i++) if (bg[i]) { bgN++; ref[0] += lab[i * 3]; ref[1] += lab[i * 3 + 1]; ref[2] += lab[i * 3 + 2]; }
  if (bgN && holes) {
    ref[0] /= bgN; ref[1] /= bgN; ref[2] /= bgN;
    const hole = new Uint8Array(n);
    let holes = 0;
    for (let i = 0; i < n; i++) if (!bg[i] && Math.hypot(lab[i * 3] - ref[0], lab[i * 3 + 1] - ref[1], lab[i * 3 + 2] - ref[2]) <= tol) { hole[i] = 1; holes++; }
    if (holes < 0.35 * (n - bgN)) for (let i = 0; i < n; i++) if (hole[i]) bg[i] = 1;
  }
  let m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = bg[i] ? 0 : 1;
  for (let e = 0; e < erode; e++) {
    const m2 = new Uint8Array(n);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      m2[i] = m[i] && m[i - 1] && m[i + 1] && m[i - w] && m[i + w] ? 1 : 0;
    }
    m = m2;
  }
  return { mask: m, bg };
}

/** Deterministic k-means in Lab (init = L-quantiles). Returns { centroids, assign, sizes }. */
function kmeans(pts, k = 4, iters = 15) {
  const n = pts.length / 3;
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => pts[x * 3] - pts[y * 3]);
  const C = [];
  for (let c = 0; c < k; c++) {
    const i = order[Math.min(n - 1, Math.floor(((c + 0.5) / k) * n))];
    C.push([pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]]);
  }
  const assign = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    const sum = C.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const L = pts[i * 3];
      const a = pts[i * 3 + 1];
      const b = pts[i * 3 + 2];
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = (L - C[c][0]) ** 2 + (a - C[c][1]) ** 2 + (b - C[c][2]) ** 2;
        if (dd < bd) {
          bd = dd;
          best = c;
        }
      }
      assign[i] = best;
      const s = sum[best];
      s[0] += L;
      s[1] += a;
      s[2] += b;
      s[3]++;
    }
    for (let c = 0; c < k; c++) if (sum[c][3]) C[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
  }
  const sizes = new Array(k).fill(0);
  for (let i = 0; i < n; i++) sizes[assign[i]]++;
  return { centroids: C, assign, sizes };
}

/**
 * Measure the product body colour of one photo. Synchronous.
 * @returns {{hex, rgb, lab, coverage, edge_touch, cluster_share, method}|null} null for scene/on-model photos
 *   or when too little product survives the cut-out.
 */
export function measurePhotoColour(file, { side = 192, k = 4, tol = 7, minCoverage = 0.06, requirePackshot = true, whiteBalance = true, mergeDE = 12, prior = null, debugMask = null } = {}) {
  if (!file || !fs.existsSync(file)) return null;
  const img = readSmall(file, side);
  if (!img) return null;
  const lab = labImage(img);
  const cc = cornerCheck(img, lab);
  if (requirePackshot && !cc.packshot) return null;
  const { w: W, h: H } = img;
  const priorLab = prior ? hexToLab(prior) : null;
  // White/off-white product on a white sweep: "enclosed background" removal would eat the product itself.
  const { mask, bg } = productMask(img, lab, { tol, holes: !(priorLab && priorLab[0] > 88 && Math.hypot(priorLab[1], priorLab[2]) < 10) });
  // Von Kries white balance against the studio sweep: per-channel gain so the bright bg (90th pct) maps to
  // paper white (linear 0.90 ≈ L 96). Removes the grey-sweep / exposure differences between shoots.
  // Gain clamped to [1, 1.6] (never darken) so a genuinely grey backdrop can't blow the product out.
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const gam = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const gains = [0, 1, 2].map((ch) => {
    const v = [];
    for (let i = 0; i < W * H; i++) if (bg[i]) v.push(lin(img.buf[i * 4 + ch]));
    if (v.length < 50) return 1;
    v.sort((a, b) => a - b);
    return Math.max(1, Math.min(1.6, 0.9 / v[Math.floor(v.length * 0.9)]));
  });
  const wb = (i) => rgbToLab(...[0, 1, 2].map((ch) => Math.max(0, Math.min(255, gam(Math.min(1, lin(img.buf[i * 4 + ch]) * gains[ch]))))));
  if (debugMask) {
    const out = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      out[i * 4] = img.buf[i * 4];
      out[i * 4 + 1] = img.buf[i * 4 + 1];
      out[i * 4 + 2] = img.buf[i * 4 + 2];
      out[i * 4 + 3] = mask[i] ? 255 : 0;
    }
    spawnSync(MAGICK(), ["-size", `${W}x${H}`, "-depth", "8", "rgba:-", debugMask], { input: out, windowsHide: true });
  }
  const sel = [];
  let border = 0;
  let borderOpaque = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x <= 2 || y <= 2 || x >= W - 3 || y >= H - 3) {
      border++;
      if (mask[i]) borderOpaque++;
    }
    if (mask[i]) sel.push(...(whiteBalance ? wb(i) : [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]]));
  }
  const n = sel.length / 3;
  const coverage = n / (W * H);
  if (coverage < minCoverage) return null;
  const pts = Float64Array.from(sel);
  const km = kmeans(pts, k);
  // Which cluster is "the colour"? Default: the largest (bag body). With a prior (the store swatch for this
  // colourway) pick, among substantial clusters (≥12 % of product pixels), the one nearest the prior —
  // footwear photos are mostly black sole/footbed, and the swatch says the strap is the bordeaux part.
  // The prior only chooses WHICH real cluster is measured; the value always comes from the pixels.
  let top = km.sizes.indexOf(Math.max(...km.sizes));
  if (priorLab) {
    const big = km.centroids.map((c, ci) => ({ ci, d: deltaE00(c, priorLab) })).filter((x) => km.sizes[x.ci] >= 0.12 * n);
    if (big.length) top = big.sort((x, y) => x.d - y.d)[0].ci;
  }
  // Same material, different shading (lit front vs shaded side) splits into 2 clusters — merge any cluster
  // whose centroid is within ΔE00 ${mergeDE} of the largest. Hardware/soles/handles/highlights stay out.
  const body = new Set([top]);
  km.centroids.forEach((c, ci) => {
    if (ci !== top && km.sizes[ci] > 0.08 * n && deltaE00(c, km.centroids[top]) <= mergeDE) body.add(ci);
  });
  const bodyN = [...body].reduce((t, ci) => t + km.sizes[ci], 0);
  const Ls = [];
  const As = [];
  const Bs = [];
  for (let i = 0; i < n; i++) {
    if (!body.has(km.assign[i])) continue;
    Ls.push(pts[i * 3]);
    As.push(pts[i * 3 + 1]);
    Bs.push(pts[i * 3 + 2]);
  }
  const labMed = [median(Ls), median(As), median(Bs)];
  // Near-black materials: the lit half of the cluster is sheen (specular), not body colour — a black bag
  // measured on its median reads charcoal. Use the diffuse tone (25th-percentile L) instead.
  let dark = false;
  if (labMed[0] < 38 && Math.hypot(labMed[1], labMed[2]) < 4) {
    const sl = Float64Array.from(Ls).sort();
    labMed[0] = sl[Math.floor(sl.length * 0.25)];
    dark = true;
  }
  const rgb = labToRgb(labMed);
  return {
    hex: toHex(rgb),
    rgb,
    lab: labMed.map((v) => Number(v.toFixed(2))),
    coverage: Number(coverage.toFixed(4)),
    edge_touch: Number((borderOpaque / border).toFixed(4)),
    cluster_share: Number((bodyN / n).toFixed(3)),
    clusters_merged: body.size,
    bg_L: Number((cc.corners.reduce((a, b) => a + b, 0) / 4).toFixed(1)),
    wb_gain: gains.map((g) => Number(g.toFixed(3))),
    method: `bg-flood(ΔE${tol})+holes+erode2${whiteBalance ? "+wb" : ""}+kmeans${k}-body(merge≤${mergeDE})-${dark ? "p25L" : "median"}@${W}x${H}`,
  };
}

// ── naming ──────────────────────────────────────────────────────────────────────
// Curated fashion palette (sRGB hex → wording a video model renders correctly). Nearest by ΔE00.
const PALETTE = [
  ["#101010", "jet black", "black"], ["#1E1E1E", "deep black", "black"], ["#2C2C2C", "deep black", "black"], ["#363534", "soft black", "black"], ["#424244", "charcoal grey", "grey"],
  ["#5E5E5E", "graphite grey", "grey"], ["#8A8A88", "mid grey", "grey"], ["#B4B4B2", "light grey", "grey"], ["#D6D5D2", "pale grey", "grey"],
  ["#F6F6F3", "optic white", "white"], ["#EEEAE0", "off-white", "white"], ["#EAE0CC", "ivory cream", "white"],
  ["#E4D6BE", "light sand beige", "beige"], ["#D9C7A8", "sand beige", "beige"], ["#CDBBA0", "light beige", "beige"], ["#C9B9A6", "latte beige", "beige"],
  ["#CBC0B3", "stone beige", "beige"], ["#B8A48E", "warm beige", "beige"], ["#ABA196", "greige", "beige"], ["#9E8675", "warm taupe-beige", "beige"],
  ["#8B7B6E", "taupe", "beige"], ["#7A685A", "mushroom taupe", "brown"], ["#6F5A4B", "mocha brown", "brown"], ["#9C7B62", "mocha latte brown", "brown"],
  ["#E9D3C8", "nude", "pink"], ["#EBD1CF", "pale blush pink", "pink"], ["#E3B7B2", "blush pink", "pink"], ["#DDA9A6", "dusty pink", "pink"],
  ["#CF9A9A", "dusty rose", "pink"], ["#B97C80", "old rose", "pink"], ["#E8A6B8", "candy pink", "pink"], ["#D97A93", "rose pink", "pink"], ["#E7C3CF", "powder pink", "pink"],
  ["#D9B48A", "light camel", "brown"], ["#C49A6C", "camel", "brown"], ["#B0723F", "tan cognac", "brown"], ["#9C5B33", "cognac brown", "brown"],
  ["#87532F", "caramel brown", "brown"], ["#7A4A2A", "cognac chestnut brown", "brown"], ["#6A4230", "chestnut brown", "brown"], ["#583628", "chocolate brown", "brown"],
  ["#4A3326", "dark chocolate brown", "brown"], ["#3A2A21", "espresso brown", "brown"],
  ["#C8202E", "true red", "red"], ["#A82230", "crimson red", "red"], ["#8B1E2E", "cherry red", "red"], ["#702131", "garnet red", "red"],
  ["#5E1B2A", "burgundy", "red"], ["#4F1119", "deep oxblood burgundy", "red"], ["#7A3446", "wine", "red"],
  ["#1F2A44", "navy blue", "blue"], ["#2A3443", "deep indigo denim blue", "blue"], ["#2E4362", "dark denim blue", "blue"], ["#3A5274", "denim blue", "blue"], ["#557197", "mid denim blue", "blue"],
  ["#8FA9C8", "light blue", "blue"], ["#B9CBE0", "powder blue", "blue"],
  ["#2F4A3A", "forest green", "green"], ["#4A6353", "dark sage green", "green"], ["#8A9A7B", "sage green", "green"], ["#6B6B3A", "olive green", "green"], ["#B5A97A", "khaki", "green"],
  ["#5A3D5C", "plum", "purple"], ["#8E6F96", "mauve", "purple"], ["#BFA9CF", "lilac", "purple"],
  ["#D4A84B", "mustard yellow", "yellow"], ["#E9D58A", "butter yellow", "yellow"], ["#C9A55C", "gold", "metallic"],
].map(([hex, en, family]) => ({ hex, en, family, lab: hexToLab(hex) }));

/** Fashion-appropriate English name for a colour: { en, family, nearest, dE }. */
export function colourName(hex) {
  const lab = hexToLab(hex);
  let best = null;
  for (const p of PALETTE) {
    const d = deltaE00(lab, p.lab);
    if (!best || d < best.dE) best = { ...p, dE: d };
  }
  let en = best.en;
  // Far from every palette entry: qualify by lightness relative to it so the word stays honest.
  if (best.dE > 7 && best.family !== "black" && best.family !== "white") {
    const dL = lab[0] - best.lab[0];
    if (dL > 6) en = `light ${en.replace(/^(light|pale|deep|dark) /, "")}`;
    else if (dL < -6) en = `deep ${en.replace(/^(light|pale|deep|dark) /, "")}`;
  }
  return { en, family: best.family, nearest: best.hex, dE: Number(best.dE.toFixed(2)) };
}

// ── colourways ─────────────────────────────────────────────────────────────────

/** Fingerprint of the photo set a measurement came from (any photo added/changed/unapproved → re-measure). */
function photoSetSig(p) {
  const parts = (p.refs || []).map((r, i) => {
    if (r.approved === false || !r.path || !fs.existsSync(r.path)) return `${i}:-`;
    const st = fs.statSync(r.path);
    return `${i}:${r.path}:${st.size}:${r.sha256 || Math.round(st.mtimeMs)}:${r.kind || ""}`;
  });
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

/**
 * Measure every clean packshot of one product and combine: per-channel median Lab across the photos that
 * show the WHOLE product (cut-out never touches the frame; detail crops only if there is nothing else).
 * Different shoots of the same colourway vary by exposure; the median across them is the stable value.
 * The source photo reported is the one closest to the combined colour.
 */
function measureProduct(p) {
  const prior = /^#?[0-9a-f]{6}$/i.test(p.colors?.[0]?.hex || "") ? p.colors[0].hex : null;
  // White product on a white sweep: the cut-out can't separate them (sabo-femme-blanc measured its grey
  // shadows). Don't publish a fake value — fall back to the swatch with a reason.
  if (prior) {
    const pl = hexToLab(prior);
    if (pl[0] > 88 && Math.hypot(pl[1], pl[2]) < 10) return { skip: "white/off-white product on a white background — not separable, using the store swatch" };
  }
  const cands = [];
  (p.refs || []).forEach((r, idx) => {
    if (r.approved === false || !r.path || !fs.existsSync(r.path)) return;
    if (r.kind === "scene") return;
    const m = measurePhotoColour(r.path, { prior });
    if (m) cands.push({ idx, ref: r, m });
  });
  if (!cands.length) return null;
  const whole = cands.filter((c) => c.m.edge_touch < 0.02);
  const use = whole.length ? whole : cands;
  const lab = [0, 1, 2].map((ch) => median(use.map((c) => c.m.lab[ch])));
  const hex = toHex(labToRgb(lab));
  const best = use.map((c) => ({ c, d: deltaE00(c.m.lab, lab) })).sort((x, y) => x.d - y.d)[0].c;
  const spread = Math.max(...use.map((c) => deltaE00(c.m.lab, lab)));
  return {
    hex, lab: lab.map((v) => Number(v.toFixed(2))),
    photo_idx: best.idx, photo_url: best.ref.url || null, photo_path: best.ref.path,
    coverage: best.m.coverage, cluster_share: best.m.cluster_share, method: best.m.method,
    photos_used: use.map((c) => ({ idx: c.idx, hex: c.m.hex })), spread_dE00: Number(spread.toFixed(1)),
  };
}

function cachedValid(p) {
  const c = p.colour_measured;
  if (!c || c.algo !== ALGO_VERSION) return null;
  return c.photo_set === photoSetSig(p) ? c : null;
}

/** Measured colour for one product (cached in products.json → colour_measured). null if no clean packshot. */
export function productColour(slug, { force = false } = {}) {
  const p = getProduct(slug);
  if (!p) throw new LabError("NOT_FOUND", `product ${slug} not synced`);
  if (!force) {
    const c = cachedValid(p);
    if (c) return c.hex ? c : null;
  }
  let m = measureProduct(p);
  const skip = m?.skip || null;
  if (skip) m = null;
  const rec = m
    ? { algo: ALGO_VERSION, hex: m.hex, lab: m.lab, descriptor_en: colourName(m.hex).en, family: colourName(m.hex).family, photo_idx: m.photo_idx, photo_url: m.photo_url, photo_path: m.photo_path, photos_used: m.photos_used, spread_dE00: m.spread_dE00, coverage: m.coverage, cluster_share: m.cluster_share, method: m.method, photo_set: photoSetSig(p), measured_at: nowIso() }
    : { algo: ALGO_VERSION, hex: null, reason: skip || "no clean plain-background packshot (only on-model/scene or close-up photos)", photo_set: photoSetSig(p), measured_at: nowIso() };
  const row = get("SELECT json FROM products WHERE slug=?", slug);
  const json = pj(row.json, {});
  json.colour_measured = rec;
  run("UPDATE products SET json=? WHERE slug=?", j(json), slug);
  return rec.hex ? rec : null;
}

const PIECE_PHRASE = {
  bag: "the bag body", tote: "the tote body", crossbody: "the crossbody bag", pouch: "the pouch",
  sneakers: "the sneakers' uppers", mules: "the mules' straps", sandals: "the sandals' straps", shoes: "the shoes' uppers",
};

function finishOf(spec, product) {
  if (spec?.finish) return spec.finish;
  const txt = `${(spec?.pieces || []).map((p) => p.en).join(" ")} ${product?.name?.fr || ""} ${product?.slug || ""}`.toLowerCase();
  if (/patent|glossy|vernis/.test(txt)) return "high-gloss patent finish (reflections are white highlights, not a lighter colour)";
  if (/canvas|denim|woven|toile/.test(txt)) return "matte woven-canvas texture";
  if (/croco/.test(txt)) return "matte croco-embossed leather-look";
  return "matte leather-look";
}

function joinList(xs) {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/**
 * Ready-to-paste colour lock for a Flow prompt.
 * @param {object} cw  a colourways() item (needs descriptor_en + measured_hex|store_hex; colour_notes optional)
 * @param {object} spec  config/product-specs/<family>.json (optional)
 */
export function colourLockSentence(cw, spec = null) {
  const hex = cw.measured_hex || cw.store_hex;
  const word = cw.descriptor_en || (hex ? colourName(hex).en : "the store colour");
  const pieces = (spec?.pieces || []).filter((pc) => pc.same_colour !== false).map((pc) => PIECE_PHRASE[pc.id] || `the ${pc.id}`);
  const subject = pieces.length ? joinList(pieces) : "the product";
  const verb = pieces.length > 1 || /s'|s$/.test(subject) ? "are" : "is";
  const notes = cw.colour_notes || spec?.colourways?.[cw.slug]?.colour_notes;
  const noteTxt = notes ? ` ${Array.isArray(notes) ? notes.join("; ") : notes}.` : "";
  return `[COLOUR LOCK: ${subject} ${verb} ${word}${hex ? ` (${hex})` : ""}, ${cw.finish || finishOf(spec, null)}.${noteTxt} Keep this exact shade in every shot and every lighting — never lighter, darker, warmer or cooler; no other colourway appears.]`.replace(/\.\./g, ".");
}

/**
 * Every colourway of the product's family (in-stock AND out-of-stock, flagged). SYNCHRONOUS.
 * Item: { slug, in_stock, name:{ar,fr} (colour name), store_hex, measured_hex, measured_lab, deltaE_store_vs_measured,
 *         descriptor_en, family, colour_notes, finish, colour_lock, source_photo, measured, photos:[{idx, role, kind, url, file}] }
 */
export function colourways(slug, { force = false } = {}) {
  const base = getProduct(slug);
  if (!base) throw new LabError("NOT_FOUND", `product ${slug} not synced`);
  const spec = loadSpec(slug);
  const sibs = siblings(slug, { inStockOnly: false });
  if (!sibs.find((x) => x.slug === slug)) sibs.push(base);
  sibs.sort((a, b) => a.slug.localeCompare(b.slug));
  return sibs.map((p) => {
    const m = productColour(p.slug, { force });
    const col = p.colors?.[0] || {};
    const store_hex = col.hex ? String(col.hex).toUpperCase() : spec?.colourways?.[p.slug]?.hex || null;
    const useHex = m?.hex || store_hex;
    const nm = useHex ? colourName(useHex) : { en: null, family: null };
    const cwSpec = spec?.colourways?.[p.slug] || {};
    const item = {
      slug: p.slug,
      in_stock: !!p.inStock,
      name: { ar: col.name?.ar || p.name?.ar || "", fr: col.name?.fr || p.name?.fr || "" },
      store_hex,
      measured_hex: m?.hex || null,
      measured_lab: m?.lab || null,
      deltaE_store_vs_measured: m?.hex && store_hex ? Number(deltaE00(hexToLab(store_hex), m.lab).toFixed(1)) : null,
      descriptor_en: nm.en,
      family: nm.family,
      measured: !!m,
      measure_note: m ? (m.spread_dE00 > 8 ? `photos disagree (spread ΔE00 ${m.spread_dE00}) — exposure differs between shoots` : null) : getProduct(p.slug)?.colour_measured?.reason || null,
      colour_notes: cwSpec.colour_notes || null,
      finish: finishOf(spec, p),
      source_photo: m ? { idx: m.photo_idx, url: m.photo_url, file: m.photo_path } : null,
      photos: (p.refs || []).map((r, idx) => ({ idx, role: r.role, kind: r.kind || null, url: r.url || null, file: r.path || null, approved: r.approved !== false })).filter((r) => r.approved && (r.url || r.file)),
    };
    item.colour_lock = colourLockSentence(item, spec);
    return item;
  });
}

/** One representative slug per family (for `product colours --all`). */
export function allFamilies() {
  const fams = new Map();
  for (const p of listProducts()) if (!fams.has(familyOf(p.slug))) fams.set(familyOf(p.slug), p.slug);
  return [...fams.entries()].map(([family, slug]) => ({ family, slug }));
}

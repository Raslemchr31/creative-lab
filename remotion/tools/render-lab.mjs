#!/usr/bin/env node
/**
 * render-lab.mjs — render a creative-lab "Lab EDL v1" with the generic Remotion
 * compositions `lab-ad` (video) / `lab-still` (one frame). See src/lab/ and
 * ad-engine/creative-lab/ARCHITECTURE.md §4.2 for the EDL contract.
 *
 *   node tools/render-lab.mjs <edl.json> <out.mp4|out.png> [--still] [--frame N] [--scale S] [-- <extra remotion flags>]
 *
 *   <edl.json>  absolute, or relative to the current directory (Remotion always gets an absolute path)
 *   <out>       .mp4 → `lab-ad` (h264, crf 18, yuv420p);  .png/.jpg/.jpeg/.webp (or --still) → `lab-still`
 *   --frame N   frame for a still (default 0)
 *   --scale S   output scale, e.g. 0.5 for a quick 540×960 proof
 *
 * Runs foreground with --concurrency=2 --timeout=90000 and exits non-zero when the EDL is
 * unreadable, an asset it references is missing under public/, Remotion fails (an invalid
 * EDL fails inside calculateMetadata with every problem listed), or the output is wrong.
 * Remotion's CLI entry is run with this same node binary: on Windows `npx` is npx.cmd,
 * which spawn() cannot start without a shell.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "public");
const CLI = join(ROOT, "node_modules", "@remotion", "cli", "remotion-cli.js");

const die = (msg, code = 2) => {
  console.error(`render-lab: ${msg}`);
  process.exit(code);
};
const usage = () => {
  console.log("usage: node tools/render-lab.mjs <edl.json> <out.mp4|out.png> [--still] [--frame N] [--scale S] [-- <extra remotion flags>]");
  process.exit(0);
};

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const dd = argv.indexOf("--");
const extra = dd >= 0 ? argv.slice(dd + 1) : [];
const args = dd >= 0 ? argv.slice(0, dd) : argv;
const positional = [];
const opt = { still: false, frame: null, scale: null };
const takeValue = (i, name) => {
  const a = args[i];
  if (a.includes("=")) return [a.slice(a.indexOf("=") + 1), i];
  if (i + 1 >= args.length) die(`${name} needs a value`);
  return [args[i + 1], i + 1];
};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-h" || a === "--help") usage();
  else if (a === "--still") opt.still = true;
  else if (a === "--frame" || a.startsWith("--frame=")) [opt.frame, i] = takeValue(i, "--frame");
  else if (a === "--scale" || a.startsWith("--scale=")) [opt.scale, i] = takeValue(i, "--scale");
  else if (a.startsWith("--")) die(`unknown flag ${a} (put Remotion flags after a lone --)`);
  else positional.push(a);
}
if (positional.length !== 2) usage();

const edlPath = resolve(process.cwd(), positional[0]);
const outPath = resolve(process.cwd(), positional[1]);
const ext = extname(outPath).toLowerCase();
const still = opt.still || [".png", ".jpg", ".jpeg", ".webp"].includes(ext);
if (still && ![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) die(`a still needs a .png/.jpg/.webp output, got ${ext || "(none)"}`);
if (!still && ext !== ".mp4") die(`a video needs an .mp4 output, got ${ext || "(none)"}`);

// ── EDL pre-flight (the full contract check runs inside the composition) ────
if (!existsSync(edlPath)) die(`EDL not found: ${edlPath}`);
let edl;
try {
  edl = JSON.parse(readFileSync(edlPath, "utf8"));
} catch (e) {
  die(`EDL is not valid JSON (${edlPath}): ${e.message}`);
}
if (edl?.version !== 1) die(`EDL version must be 1, got ${JSON.stringify(edl?.version)}`);
for (const key of ["width", "height", "fps", "durationInFrames"]) {
  if (typeof edl[key] !== "number" || !(edl[key] > 0)) die(`EDL ${key} must be a positive number, got ${JSON.stringify(edl[key])}`);
}
const srcs = [];
(Array.isArray(edl.segments) ? edl.segments : []).forEach((s, i) =>
  (Array.isArray(s?.layers) ? s.layers : []).forEach((l, j) => {
    if (l && typeof l.src === "string") srcs.push([`segments[${i}].layers[${j}]`, l.src]);
  }),
);
if (edl.audio && typeof edl.audio.src === "string") srcs.push(["audio", edl.audio.src]);
const missing = srcs
  .map(([where, src]) => [where, src, join(PUBLIC, src.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^public\//, ""))])
  .filter(([, , p]) => !existsSync(p));
if (missing.length) die(`missing asset(s) under ${PUBLIC}:\n${missing.map(([w, s]) => `  - ${w}: ${s}`).join("\n")}`);

let frame = 0;
if (still) {
  frame = opt.frame === null ? 0 : Number(opt.frame);
  if (!Number.isInteger(frame) || frame < 0 || frame >= edl.durationInFrames) die(`--frame must be an integer in 0..${edl.durationInFrames - 1}, got ${opt.frame}`);
} else if (opt.frame !== null) die("--frame is for stills (use -- --frames=a-b for a video range)");
let scale = null;
if (opt.scale !== null) {
  scale = Number(opt.scale);
  if (!(scale > 0 && scale <= 4)) die(`--scale must be a number in (0, 4], got ${opt.scale}`);
}
if (!existsSync(CLI)) die(`Remotion CLI not found at ${CLI} — run npm install in ${ROOT}`);
mkdirSync(dirname(outPath), { recursive: true });

// ── render ──────────────────────────────────────────────────────────────────
const common = [`--props=${edlPath}`, "--timeout=90000", ...(scale !== null ? [`--scale=${scale}`] : [])];
const cmd = still
  ? [CLI, "still", "src/index.ts", "lab-still", outPath, ...common, `--frame=${frame}`, `--image-format=${ext === ".png" ? "png" : ext === ".webp" ? "webp" : "jpeg"}`, ...extra]
  : // --color-space=bt709: Remotion's "default" emits no colour flags, so the JPEG frames come out as
    // full-range yuvj420p/bt470bg; bt709 adds zscale → limited range, tagged yuv420p tv bt709 (what Meta expects)
    [CLI, "render", "src/index.ts", "lab-ad", outPath, ...common, "--codec=h264", "--crf=18", "--pixel-format=yuv420p", "--color-space=bt709", "--concurrency=2", ...extra];

console.log(
  `render-lab: ${still ? `still frame ${frame}` : `video ${edl.durationInFrames}f`} of "${edl.id ?? "?"}" ${edl.width}x${edl.height}@${edl.fps}` +
    `${scale !== null ? ` ×${scale}` : ""} → ${outPath}`,
);
const t0 = Date.now();
const r = spawnSync(process.execPath, cmd, { cwd: ROOT, stdio: "inherit" });
const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (r.error) die(`could not start Remotion: ${r.error.message}`, 1);
if (r.status !== 0) die(`Remotion exited with ${r.status ?? r.signal} after ${secs}s`, r.status || 1);
if (!existsSync(outPath) || statSync(outPath).size === 0) die(`Remotion reported success but ${outPath} is missing or empty`, 1);

// ── verify the file we hand back ────────────────────────────────────────────
const s = scale ?? 1;
const expW = Math.round(edl.width * s);
const expH = Math.round(edl.height * s);
const problems = [];
let summary = `${(statSync(outPath).size / 1024).toFixed(0)} KB`;
const probe = spawnSync(
  "ffprobe",
  ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,nb_frames:format=duration", "-of", "json", outPath],
  { encoding: "utf8" },
);
if (probe.status === 0) {
  const j = JSON.parse(probe.stdout || "{}");
  const v = (j.streams || []).find((x) => x.codec_type === "video") || {};
  const a = (j.streams || []).find((x) => x.codec_type === "audio");
  // h264 needs even dimensions: allow a 1 px rounding difference
  if (Math.abs(v.width - expW) > 1 || Math.abs(v.height - expH) > 1) problems.push(`size ${v.width}x${v.height}, expected ${expW}x${expH}`);
  if (still) {
    summary += ` · ${v.width}x${v.height} ${v.codec_name}`;
  } else {
    const frames = Number(v.nb_frames || 0);
    const dur = Number(j.format?.duration || 0);
    if (v.codec_name !== "h264") problems.push(`codec ${v.codec_name}, expected h264`);
    if (v.pix_fmt !== "yuv420p") problems.push(`pix_fmt ${v.pix_fmt}, expected yuv420p`);
    if (frames && Math.abs(frames - edl.durationInFrames) > 1) problems.push(`${frames} frames, expected ${edl.durationInFrames}`);
    summary += ` · ${v.width}x${v.height} ${v.codec_name} ${v.pix_fmt} ${v.r_frame_rate} · ${frames} frames · ${dur.toFixed(3)} s · audio ${a ? a.codec_name : "none"}`;
  }
} else {
  summary += " · (ffprobe unavailable — not verified)";
}
console.log(`render-lab: ${problems.length ? "WRONG OUTPUT" : "ok"} in ${secs}s → ${outPath} · ${summary}`);
if (problems.length) die(problems.join("; "), 1);

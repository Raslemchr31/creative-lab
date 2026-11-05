// creative-lab :: ffprobe / ffmpeg / magick wrappers (argv arrays only — Windows paths
// inside a filtergraph string break ffmpeg, see video-understanding REFERENCE.md).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { config } from "./util.mjs";

const tool = (k) => config().tools?.[k] || k;

export function runTool(bin, args, { timeoutMs = 300000, input } = {}) {
  const r = spawnSync(bin, args, { encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, input, windowsHide: true });
  return { code: r.status, stdout: r.stdout || "", stderr: r.stderr || "", error: r.error };
}

/** ffprobe a file → { kind, width, height, duration, fps, codec, audio, rotation, display_w, display_h, size } */
export function probe(file) {
  if (!fs.existsSync(file)) throw new Error(`probe: missing ${file}`);
  const r = runTool(tool("ffprobe"), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { timeoutMs: 60000 });
  if (r.code !== 0) throw new Error(`ffprobe failed (${r.code}): ${r.stderr.slice(0, 300)}`);
  const j = JSON.parse(r.stdout);
  const v = (j.streams || []).find((s) => s.codec_type === "video");
  const a = (j.streams || []).find((s) => s.codec_type === "audio");
  const fmt = j.format || {};
  const isImage = v && (/^(png|mjpeg|webp|bmp|gif|tiff)$/.test(v.codec_name) && (!fmt.duration || Number(fmt.duration) < 0.05 || /image2|png_pipe|jpeg_pipe|webp_pipe/.test(fmt.format_name || "")));
  let rotation = 0;
  const sd = v?.side_data_list?.find((d) => d.rotation !== undefined);
  if (sd) rotation = Number(sd.rotation) || 0;
  else if (v?.tags?.rotate) rotation = Number(v.tags.rotate) || 0;
  const w = v ? Number(v.width) : null;
  const h = v ? Number(v.height) : null;
  const swap = Math.abs(rotation) % 180 === 90;
  const [fn, fd] = String(v?.avg_frame_rate || v?.r_frame_rate || "0/1").split("/").map(Number);
  return {
    kind: !v ? (a ? "audio" : "unknown") : isImage ? "image" : "video",
    width: w,
    height: h,
    display_w: swap ? h : w,
    display_h: swap ? w : h,
    rotation,
    duration: fmt.duration ? Number(fmt.duration) : v?.duration ? Number(v.duration) : null,
    fps: fd ? Number((fn / fd).toFixed(3)) : null,
    codec: v?.codec_name || null,
    pix_fmt: v?.pix_fmt || null,
    audio: a ? { codec: a.codec_name, channels: a.channels, sample_rate: Number(a.sample_rate) } : null,
    size: fmt.size ? Number(fmt.size) : fs.statSync(file).size,
    format: fmt.format_name || null,
  };
}

/** Aspect label for display dims, tolerant to ±2%. */
export function aspectLabel(w, h) {
  if (!w || !h) return null;
  const r = w / h;
  const table = [["9:16", 9 / 16], ["4:5", 4 / 5], ["1:1", 1], ["16:9", 16 / 9], ["2:3", 2 / 3], ["3:4", 3 / 4], ["1.91:1", 1.91]];
  for (const [k, v] of table) if (Math.abs(r - v) / v <= 0.02) return k;
  return `${w}x${h}`;
}

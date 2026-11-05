#!/usr/bin/env node
// Environment check for a fresh machine: node:sqlite, Chrome, ffmpeg/ffprobe, ImageMagick, tar,
// whisper (optional), Remotion deps, library data, Kie key. Exit 1 if a REQUIRED piece is missing.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rows = [];
let bad = 0;
const check = (name, ok, detail, required = true) => {
  rows.push(`${ok ? "OK  " : required ? "MISS" : "opt "}  ${name.padEnd(22)} ${detail}`);
  if (!ok && required) bad++;
};
const has = (bin, args = ["-version"]) => {
  const r = spawnSync(bin, args, { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? (r.stdout || r.stderr).split("\n")[0].trim() : null;
};
const [maj, min] = process.versions.node.split(".").map(Number);
check("node >= 22.13", maj > 22 || (maj === 22 && min >= 13), process.version);
let sqliteOk = true;
try {
  await import("node:sqlite");
} catch {
  sqliteOk = false;
}
check("node:sqlite", sqliteOk, sqliteOk ? "available" : "upgrade Node to 22.13+");
const chrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => p && fs.existsSync(p));
check("Google Chrome", !!chrome, chrome || "install Google Chrome (the spy drives it headless)");
check("ffmpeg", !!has("ffmpeg"), has("ffmpeg") || "install ffmpeg and add it to PATH (winget install Gyan.FFmpeg)");
check("ffprobe", !!has("ffprobe"), has("ffprobe") || "comes with ffmpeg");
check("ImageMagick (magick)", !!has("magick", ["-version"]), has("magick", ["-version"]) || "winget install ImageMagick.ImageMagick");
check("whisper-cli (ASR)", !!has("whisper-cli", ["--help"]), "optional: transcripts of reference ads", false);
check("lab deps", fs.existsSync(path.join(root, "node_modules", "playwright-core")), "npm install");
check("remotion deps", fs.existsSync(path.join(root, "remotion", "node_modules", "@remotion", "cli")), "cd remotion && npm install");
check("library data", fs.existsSync(path.join(root, "data", "lab.db")), "node tools/seed.mjs import --file <seed.tar.gz>  (or start empty + spy)", false);
check("Kie.ai key", fs.existsSync(path.join(root, ".env")), "optional: only for live generation (copy .env.example → .env)", false);
console.log(rows.join("\n"));
process.exit(bad ? 1 : 0);

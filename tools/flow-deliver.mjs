#!/usr/bin/env node
// Deliver a Flow prompt to the owner (owner rules 2026-11-06):
//  1. copy the reference photos into Downloads/<CODE> <label>/UPLOAD, numbered in the order the prompt names them;
//  2. write the prompt as UTF-8 WITH BOM (.txt) — Arabic stays in the right order when copied from Notepad;
//  3. open the UPLOAD folder in Explorer and the prompt in Notepad.
//
// Usage: node tools/flow-deliver.mjs --code FL-XXXXX --label "pack-hobo-4-colours" --prompt <file> \
//          --photo "1-ROSE-pack=data/media/products/pack-hobo-rose/ref-1.jpg" --photo "2-NOIRE-pack=…" …
//        [--no-open]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const opt = { photos: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--code") opt.code = args[++i];
  else if (a === "--label") opt.label = args[++i];
  else if (a === "--prompt") opt.prompt = args[++i];
  else if (a === "--photo") opt.photos.push(args[++i]);
  else if (a === "--no-open") opt.noOpen = true;
}
if (!opt.code || !opt.prompt || !opt.photos.length) {
  console.error('usage: --code FL-XXXXX --label <slug> --prompt <file> --photo "<name>=<src>" [--photo …] [--no-open]');
  process.exit(1);
}
const root = path.join(os.homedir(), "Downloads", `${opt.code}${opt.label ? ` ${opt.label}` : ""}`);
const up = path.join(root, "UPLOAD");
fs.mkdirSync(up, { recursive: true });
for (const f of fs.readdirSync(up)) fs.rmSync(path.join(up, f)); // UPLOAD holds exactly this prompt's photos
const out = [];
for (const spec of opt.photos) {
  const eq = spec.indexOf("=");
  if (eq < 1) throw new Error(`bad --photo ${spec}`);
  const name = spec.slice(0, eq).trim();
  const src = spec.slice(eq + 1).trim();
  if (!fs.existsSync(src)) throw new Error(`photo not found: ${src}`);
  const dest = path.join(up, name + path.extname(src).toLowerCase());
  fs.copyFileSync(src, dest);
  out.push(path.basename(dest));
}
const text = fs.readFileSync(opt.prompt, "utf8").replace(/^﻿/, "").replace(/\r?\n/g, "\r\n");
const promptFile = path.join(root, `${opt.code} FLOW PROMPT.txt`);
fs.writeFileSync(promptFile, "﻿" + text, "utf8");
console.log(JSON.stringify({ folder: up, photos: out, prompt: promptFile }, null, 2));
if (!opt.noOpen) {
  spawn("explorer.exe", [up], { detached: true, stdio: "ignore" }).unref();
  spawn("notepad.exe", [promptFile], { detached: true, stdio: "ignore" }).unref();
}

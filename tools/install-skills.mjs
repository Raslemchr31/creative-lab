#!/usr/bin/env node
// Links the lab's Claude Code skills (skills/*) into ~/.claude/skills so /lab, /ad-spy, /kie-ai and
// /flow-prompt work in any Claude Code session. Windows → directory junctions, else symlinks.
// Restart Claude Code afterwards (skills load at session start).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "skills");
const dst = path.join(os.homedir(), ".claude", "skills");
fs.mkdirSync(dst, { recursive: true });
for (const name of fs.readdirSync(src)) {
  const from = path.join(src, name);
  if (!fs.existsSync(path.join(from, "SKILL.md"))) continue;
  const to = path.join(dst, name);
  let state = "linked";
  try {
    const cur = fs.lstatSync(to);
    if (cur.isSymbolicLink() || cur.isDirectory()) {
      const real = fs.realpathSync(to);
      if (path.resolve(real) === path.resolve(from)) {
        console.log(`ok       ${name}`);
        continue;
      }
      state = `skipped (already exists → ${real}; remove it to relink)`;
      console.log(`${name}: ${state}`);
      continue;
    }
  } catch {
    /* missing → create */
  }
  fs.symlinkSync(from, to, process.platform === "win32" ? "junction" : "dir");
  console.log(`linked   ${name} → ${from}`);
}
console.log("Restart Claude Code to load the skills.");

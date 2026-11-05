#!/usr/bin/env node
// creative-lab :: seed bundle — move the curated library to another machine.
//
//   node tools/seed.mjs export [--out dist/creative-lab-seed.tar.gz]
//   node tools/seed.mjs import --file creative-lab-seed.tar.gz [--force]
//
// The bundle holds: lab.db (absolute paths rewritten to a placeholder), DNA drafts, prompt codes (briefs),
// evidence packs (no audio scratch), product photos + thumbnails, and for every CURATED ad its images /
// video previews (+ full videos for the DNA-analysed references). Media rows whose file is not shipped are
// marked status='remote' so the UI never shows a broken card. Import rewrites the placeholder to this clone.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const LAB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/");
const DATA = `${LAB_ROOT}/data`;
const MARK = "@LAB_ROOT@";
const args = process.argv.slice(2);
const cmd = args[0];
const flag = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i === -1 ? d : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true;
};
const die = (m) => {
  console.error(`seed: ${m}`);
  process.exit(1);
};
const tar = (a, cwd) => {
  // Windows: use the built-in bsdtar (System32) — Git Bash's GNU tar reads "C:" as a remote host.
  const bin = process.platform === "win32" && fs.existsSync("C:/Windows/System32/tar.exe") ? "C:/Windows/System32/tar.exe" : "tar";
  const r = spawnSync(bin, a, { cwd, stdio: "inherit", windowsHide: true });
  if (r.status !== 0) die(`tar ${a[0]} failed (${r.status}) — needs the system tar (Windows 10+ ships bsdtar)`);
};

function rewritePaths(db, from, to) {
  const forms = [[from, to], [from.replace(/\//g, "\\"), to.replace(/\//g, "\\")], [from.replace(/\//g, "\\\\"), to.replace(/\//g, "\\\\")]];
  let n = 0;
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    for (const col of db.prepare(`PRAGMA table_info("${name}")`).all()) {
      if (!/TEXT|^$/i.test(col.type || "")) continue;
      for (const [a, b] of forms) {
        if (a === b) continue;
        n += Number(db.prepare(`UPDATE "${name}" SET "${col.name}" = REPLACE("${col.name}", ?, ?) WHERE "${col.name}" LIKE ?`).run(a, b, `%${a}%`).changes);
      }
    }
  }
  return n;
}

function copyFile(src, rel, stage) {
  if (!src || !fs.existsSync(src)) return 0;
  const dst = path.join(stage, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return fs.statSync(src).size;
}
function copyDir(src, rel, stage, skip = () => false) {
  if (!fs.existsSync(src)) return 0;
  let bytes = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    if (skip(s)) continue;
    bytes += e.isDirectory() ? copyDir(s, path.join(rel, e.name), stage, skip) : copyFile(s, path.join(rel, e.name), stage);
  }
  return bytes;
}

function doExport() {
  const out = path.resolve(LAB_ROOT, flag("out", "dist/creative-lab-seed.tar.gz"));
  const stage = `${LAB_ROOT}/dist/seed-staging`;
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(`${stage}/data`, { recursive: true });
  // 1. consistent DB copy
  const live = new DatabaseSync(`${DATA}/lab.db`);
  live.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  live.close();
  fs.copyFileSync(`${DATA}/lab.db`, `${stage}/data/lab.db`);
  const db = new DatabaseSync(`${stage}/data/lab.db`);
  // 2. which ad media ships
  const curated = new Set(db.prepare("SELECT ad_archive_id FROM ads WHERE is_rep=1 AND hidden=0 AND relevance >= 0.35").all().map((r) => r.ad_archive_id));
  const dnaIds = new Set(db.prepare("SELECT ref_id FROM dna").all().map((r) => r.ref_id));
  let bytes = 0;
  let shipped = 0;
  let remote = 0;
  const media = db.prepare("SELECT id, owner_id, role, local_path FROM media WHERE owner_kind='ad' AND status='ok'").all();
  const setRemote = db.prepare("UPDATE media SET status='remote' WHERE id=?");
  db.exec("BEGIN");
  for (const m of media) {
    const keep = (dnaIds.has(m.owner_id) || (curated.has(m.owner_id) && !/video$/.test(m.role))) && m.local_path && fs.existsSync(m.local_path);
    if (keep) {
      const rel = path.relative(LAB_ROOT, m.local_path);
      bytes += copyFile(m.local_path, rel, stage);
      shipped++;
    } else {
      setRemote.run(m.id);
      remote++;
    }
  }
  db.exec("COMMIT");
  // 3. folders that always ship
  bytes += copyDir(`${DATA}/media/products`, "data/media/products", stage);
  bytes += copyDir(`${DATA}/evidence`, "data/evidence", stage, (p) => /\.(wav|16k\.wav)$/i.test(p));
  bytes += copyDir(`${DATA}/dna-drafts`, "data/dna-drafts", stage);
  bytes += copyDir(`${DATA}/briefs`, "data/briefs", stage);
  // 4. portable paths
  const rewritten = rewritePaths(db, LAB_ROOT, MARK);
  db.exec("VACUUM");
  db.close();
  fs.writeFileSync(`${stage}/data/SEED.json`, JSON.stringify({ made_at: new Date().toISOString(), from: LAB_ROOT, marker: MARK, media_shipped: shipped, media_remote: remote, bytes, rewritten }, null, 2));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  tar(["-czf", out, "data"], stage);
  fs.rmSync(stage, { recursive: true, force: true });
  console.log(JSON.stringify({ out, size_mb: Math.round(fs.statSync(out).size / 1e6), media_shipped: shipped, media_remote: remote, rewritten }, null, 2));
}

function doImport() {
  const file = flag("file");
  if (!file || file === true) die("--file <creative-lab-seed.tar.gz> is required");
  if (!fs.existsSync(file)) die(`no such file: ${file}`);
  if (fs.existsSync(`${DATA}/lab.db`) && !flag("force")) die(`${DATA}/lab.db already exists — pass --force to replace it`);
  fs.mkdirSync(DATA, { recursive: true });
  for (const f of ["lab.db", "lab.db-wal", "lab.db-shm"]) fs.rmSync(`${DATA}/${f}`, { force: true });
  tar(["-xzf", path.resolve(file)], LAB_ROOT);
  const db = new DatabaseSync(`${DATA}/lab.db`);
  const n = rewritePaths(db, MARK, LAB_ROOT);
  db.close();
  const meta = JSON.parse(fs.readFileSync(`${DATA}/SEED.json`, "utf8"));
  console.log(JSON.stringify({ imported: file, into: LAB_ROOT, paths_rewritten: n, media_files: meta.media_shipped, seed_made: meta.made_at }, null, 2));
}

if (cmd === "export") doExport();
else if (cmd === "import") doImport();
else {
  console.log("usage: node tools/seed.mjs export [--out dist/creative-lab-seed.tar.gz]\n       node tools/seed.mjs import --file <seed.tar.gz> [--force]");
  process.exit(cmd ? 1 : 0);
}

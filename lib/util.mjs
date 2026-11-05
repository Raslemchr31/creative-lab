// creative-lab :: shared helpers (paths, config, env, json, hashing, logging).
// Zero dependencies. Every other module imports from here so paths resolve the
// same way no matter which directory a command is launched from.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const LAB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ENGINE_ROOT = path.resolve(LAB_ROOT, "..");

/** Forward-slash absolute path under the lab root (Windows-safe for ffmpeg/remotion argv). */
export const labPath = (...p) => path.join(LAB_ROOT, ...p).replace(/\\/g, "/");
export const enginePath = (...p) => path.join(ENGINE_ROOT, ...p).replace(/\\/g, "/");
export const fwd = (p) => String(p).replace(/\\/g, "/");

/** Runtime data root (data/ under the lab; tests point LAB_DATA_DIR at a temp dir). */
export const dataPath = (...p) => path.join(process.env.LAB_DATA_DIR || path.join(LAB_ROOT, "data"), ...p).replace(/\\/g, "/");

export function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw new Error(`readJson(${file}): ${e.message}`);
  }
}

export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

export function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
  return d;
}

let _config;
/** config/lab.json merged with optional config/lab.local.json (machine overrides, gitignored). */
export function config() {
  if (_config) return _config;
  const base = readJson(labPath("config/lab.json"));
  const local = readJson(labPath("config/lab.local.json"), {});
  _config = deepMerge(base, local);
  // Tool paths may be repo-relative ("./remotion") so a fresh clone works anywhere.
  for (const [k, v] of Object.entries(_config.tools || {})) if (typeof v === "string" && /^\.{1,2}\//.test(v)) _config.tools[k] = labPath(v);
  return _config;
}
export function resetConfigCache() {
  _config = undefined;
}

export function deepMerge(a, b) {
  if (Array.isArray(a) || Array.isArray(b) || typeof a !== "object" || typeof b !== "object" || !a || !b) {
    return b === undefined ? a : b;
  }
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = k in a ? deepMerge(a[k], b[k]) : b[k];
  return out;
}

/**
 * Minimal .env parser. Reads the lab's own .env (KIE_API_KEY etc.). Values are
 * returned, never logged. process.env wins over the file so CI/tests can inject.
 */
export function loadEnv(file = labPath(".env")) {
  const out = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
  }
  for (const k of Object.keys(out)) if (process.env[k] !== undefined && process.env[k] !== "") out[k] = process.env[k];
  for (const k of ["KIE_API_KEY", "KIE_BASE_URL", "KIE_UPLOAD_BASE_URL"]) if (process.env[k]) out[k] = process.env[k];
  return out;
}

export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
export const sha256File = (file) => sha256(fs.readFileSync(file));
export const shortHash = (s, n = 10) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, n);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const jitter = ([lo, hi]) => Math.round(lo + Math.random() * (hi - lo));

export const nowIso = () => new Date().toISOString();
export const epochToIso = (s) => (s ? new Date(s * 1000).toISOString() : null);
export const daysBetween = (aSec, bSec) => (aSec && bSec ? (bSec - aSec) / 86400 : null);

export function slugify(s, max = 48) {
  return String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

/** JSON column helpers: never throw on a bad row. */
export const j = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
export function pj(s, fallback = null) {
  if (s === null || s === undefined || s === "") return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

/** Append-only JSONL log under data/logs/. Never pass secrets in `obj`. */
export function logLine(name, obj) {
  const dir = ensureDir(dataPath("logs"));
  fs.appendFileSync(path.join(dir, `${name}.jsonl`), JSON.stringify({ t: nowIso(), ...obj }) + "\n");
}

export function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Arabic-script ratio of the letters in s (0..1). */
export function arabicRatio(s) {
  const letters = String(s || "").match(/\p{L}/gu) || [];
  if (!letters.length) return 0;
  const ar = letters.filter((c) => /[؀-ۿݐ-ݿࢠ-ࣿ]/.test(c)).length;
  return ar / letters.length;
}

/** Coarse language guess for ad copy: ar | fr | en | mixed | unknown. */
export function guessLang(s) {
  const t = String(s || "");
  if (!t.trim()) return "unknown";
  const r = arabicRatio(t);
  if (r > 0.75) return "ar";
  if (r > 0.2) return "mixed";
  const fr = (t.match(/\b(le|la|les|des|du|un|une|et|pour|avec|livraison|disponible|commande|prix|sac|chez|vous|votre)\b/gi) || []).length;
  const en = (t.match(/\b(the|and|for|with|your|you|free|shipping|order|now|shop|get)\b/gi) || []).length;
  if (fr === 0 && en === 0) return "unknown";
  return fr >= en ? "fr" : "en";
}

export class LabError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

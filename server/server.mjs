#!/usr/bin/env node
// creative-lab :: local UI server — zero dependencies (node:http) + vanilla JS front end.
//
//   node --no-warnings server/server.mjs [--port 4317] [--verbose]
//
// • Binds 127.0.0.1 only and rejects foreign Host / Origin headers (DNS-rebinding + CSRF guard).
// • JSON API = ARCHITECTURE.md §4.4. Read-mostly: the only writes are star/hide, reference-photo
//   approval, batch compile and preflight.
// • /files/* = read-only view of data/{media,evidence,batches}, Range-capable for <video> seeking.
// • Spend lock: no route generates. On top of that this process refuses every outbound fetch to a
//   Kie.ai host, so a click can never spend credits even through a lib bug. Generation is CLI-only:
//   node cli.mjs gen run --batch <id> --confirm <id>
// • lib/styles.mjs + lib/batch.mjs are loaded lazily and hot-reloaded when their mtime changes; while
//   they are missing or broken their endpoints answer 503 and everything else keeps working.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── spend lock — installed before any lib module is imported ─────────────────────
const KIE_HOST_RE = /(^|\.)(kie\.ai|redpandaai\.co)$/i;
const blockedHosts = new Set();
const realFetch = globalThis.fetch;
globalThis.fetch = function labUiFetch(input, init) {
  let host = "";
  try {
    host = new URL(input instanceof Request ? input.url : String(input)).hostname.toLowerCase();
  } catch {}
  if (host && (KIE_HOST_RE.test(host) || blockedHosts.has(host))) {
    return Promise.reject(new Error(`creative-lab UI refuses outbound calls to ${host} — generation is CLI-only`));
  }
  return realFetch(input, init);
};

const { config, LAB_ROOT, labPath, pj, readJson, LabError } = await import("../lib/util.mjs");
const { all, get, run, closeDb } = await import("../lib/db.mjs");
const { getDna, listDna } = await import("../lib/analyze.mjs");
const { listProducts, getProduct, setRefApproval } = await import("../lib/products/sync.mjs");

for (const u of [config().kie?.base_url, config().kie?.upload_base_url]) {
  try {
    blockedHosts.add(new URL(u).hostname.toLowerCase());
  } catch {}
}

// ── args + constants ─────────────────────────────────────────────────────────────
function flag(name) {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}`) return argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : true;
    if (argv[i].startsWith(`--${name}=`)) return argv[i].slice(name.length + 3);
  }
  return undefined;
}
const portArg = flag("port");
const PORT = portArg === undefined ? Number(config().ui_port ?? 4317) : typeof portArg === "string" ? Number(portArg) : NaN;
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error("✗ invalid --port (expected 1–65535)");
  process.exit(1);
}
const VERBOSE = !!flag("verbose");
const HOST = "127.0.0.1";
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, ...(PORT === 80 ? ["127.0.0.1", "localhost"] : [])]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

const IS_WIN = process.platform === "win32";
const PUBLIC_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const DATA_ROOT = path.resolve(process.env.LAB_DATA_DIR || path.join(LAB_ROOT, "data")); // same rule as util.dataPath()
const FILE_TOP_DIRS = new Set(["media", "evidence", "batches"]); // nothing else under data/ (lab.db, logs) is served
const MIN_REL = () => config().scoring?.min_relevance ?? 0.35;
const genCommand = (id) => `node cli.mjs gen run --batch ${id} --confirm ${id}`;

const AD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/;
const STYLE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;
const BATCH_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;
const PLACEMENTS = new Set(["9:16", "4:5", "1:1"]);
const LANGS = new Set(["ar-DZ", "ar", "fr"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".srt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
};
const mimeOf = (f) => MIME[path.extname(f).toLowerCase()] || "application/octet-stream";

const BASE_HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin" };
const PAGE_CSP =
  "default-src 'self'; img-src 'self' data: https://sirinealgeria.store; media-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
// Anything opened straight from data/ (an .svg, an .html dropped by a tool…) can never run script.
const FILE_CSP = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox";

// ── small helpers ────────────────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
class Reply {
  constructor(status, body) {
    this.status = status;
    this.body = body;
  }
}
const bad = (msg, extra) => new HttpError(400, msg, extra);
const truthy = (v) => v !== null && v !== undefined && /^(1|true|yes|on)$/i.test(String(v));
const num = (v, d) => {
  if (v === null || v === undefined || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const isHttp = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n).trimEnd()}…` : s ?? null);
const asArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v) {
    const p = pj(v, null);
    return Array.isArray(p) ? p : p === null ? [v] : [p];
  }
  return [];
};
const asObj = (v) => (v && typeof v === "object" ? v : typeof v === "string" ? pj(v, null) : null);

function sendJson(res, status, body, extra = {}) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8", "Content-Length": buf.length, "Cache-Control": "no-store", ...extra });
  res.end(res.req?.method === "HEAD" ? undefined : buf);
}

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit * 8) req.destroy();
      else if (size <= limit) chunks.push(c);
    });
    req.on("end", () => (size > limit ? reject(new HttpError(413, "request body too large")) : resolve(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
}

async function jsonBody(req) {
  if (!/^application\/json\b/i.test(String(req.headers["content-type"] || ""))) throw new HttpError(415, "Content-Type must be application/json");
  const text = await readBody(req);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw bad("invalid JSON body");
  }
}

// ── path safety ──────────────────────────────────────────────────────────────────
const WIN_DEVICE_RE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$|clock\$)(\.|$)/i;

/** Percent-encoded relative path → safe segments, or null. Rejects traversal, drive letters,
 *  backslashes, NTFS streams (':'), dotfiles, Windows device names and trailing dots/spaces. */
function safeSegments(encoded) {
  let decoded;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  if (!decoded || decoded.startsWith("/") || /[\x00-\x1f\x7f\\:*?"<>|]/.test(decoded)) return null;
  const segs = decoded.split("/");
  for (const s of segs) {
    if (!s || s.startsWith(".") || /[. ]$/.test(s) || WIN_DEVICE_RE.test(s)) return null;
  }
  return segs;
}

function within(root, target) {
  const rel = path.relative(root, target);
  return rel === "" || (rel.split(path.sep)[0] !== ".." && !path.isAbsolute(rel));
}

const realRoots = new Map();
function realWithin(root, target) {
  try {
    if (!realRoots.has(root)) realRoots.set(root, fs.realpathSync.native(root));
    const r = realRoots.get(root);
    const t = fs.realpathSync.native(target);
    const a = IS_WIN ? r.toLowerCase() : r;
    const b = IS_WIN ? t.toLowerCase() : t;
    return b === a || b.startsWith(a.endsWith(path.sep) ? a : a + path.sep) ? t : null;
  } catch {
    return null;
  }
}

/** Absolute local path under data/{media,evidence,batches} → "/files/…" URL (only if the file exists). */
function fileUrl(p) {
  if (!p || typeof p !== "string" || isHttp(p)) return null;
  const abs = path.resolve(p);
  if (!within(DATA_ROOT, abs)) return null;
  const segs = path.relative(DATA_ROOT, abs).split(path.sep);
  if (!FILE_TOP_DIRS.has(segs[0].toLowerCase())) return null;
  const enc = segs.map(encodeURIComponent).join("/");
  if (!safeSegments(enc)) return null;
  try {
    if (!fs.statSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  return `/files/${enc}`;
}

function listFiles(dir, depth = 2, out = []) {
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 1) listFiles(full, depth - 1, out);
    } else if (e.isFile()) out.push(full);
  }
  return out;
}

// ── static + /files serving (GET/HEAD, ETag, single-range) ───────────────────────
function serveFile(req, res, file, st, { cache = "no-cache", csp } = {}) {
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const lastModified = st.mtime.toUTCString();
  const headers = { ...BASE_HEADERS, "Content-Type": mimeOf(file), "Accept-Ranges": "bytes", ETag: etag, "Last-Modified": lastModified, "Cache-Control": cache };
  if (csp) headers["Content-Security-Policy"] = csp;
  const inm = req.headers["if-none-match"];
  if (inm && inm.split(/\s*,\s*/).some((t) => t === etag || t === `W/${etag}`)) {
    res.writeHead(304, headers);
    return res.end();
  }
  let start = 0;
  let end = st.size - 1;
  let status = 200;
  const range = req.headers.range;
  const ifRange = req.headers["if-range"];
  if (range && (!ifRange || ifRange === etag || ifRange === lastModified)) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    // Multi-range, other units and syntactically invalid specs are ignored (full 200), per RFC 9110 §14.2.
    const valid = m && (m[1] !== "" || m[2] !== "") && !(m[1] !== "" && m[2] !== "" && Number(m[2]) < Number(m[1]));
    if (valid) {
      if (m[1] === "") {
        const n = Number(m[2]);
        start = n === 0 ? st.size : Math.max(0, st.size - n);
      } else {
        start = Number(m[1]);
        if (m[2] !== "") end = Math.min(Number(m[2]), st.size - 1);
      }
      if (!Number.isSafeInteger(start) || start >= st.size) {
        res.writeHead(416, { ...headers, "Content-Range": `bytes */${st.size}`, "Content-Length": 0 });
        return res.end();
      }
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
    }
  }
  headers["Content-Length"] = st.size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (req.method === "HEAD" || st.size === 0) return res.end();
  const stream = fs.createReadStream(file, { start, end });
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

function serveData(req, res, encodedRest) {
  const segs = safeSegments(encodedRest);
  if (!segs || !FILE_TOP_DIRS.has(segs[0].toLowerCase())) return sendJson(res, 403, { error: "forbidden path" });
  const full = path.resolve(DATA_ROOT, ...segs);
  if (!within(DATA_ROOT, full)) return sendJson(res, 403, { error: "forbidden path" });
  let st;
  try {
    st = fs.statSync(full);
  } catch {
    return sendJson(res, 404, { error: "not found" });
  }
  if (!st.isFile()) return sendJson(res, 404, { error: "not found" });
  const real = realWithin(DATA_ROOT, full);
  if (!real) return sendJson(res, 403, { error: "forbidden path" });
  return serveFile(req, res, real, st, { cache: "private, max-age=300", csp: FILE_CSP });
}

function serveStatic(req, res, rawPath) {
  const segs = safeSegments(rawPath === "/" ? "index.html" : rawPath.slice(1));
  if (!segs) return sendJson(res, 403, { error: "forbidden path" });
  const full = path.resolve(PUBLIC_ROOT, ...segs);
  if (!within(PUBLIC_ROOT, full)) return sendJson(res, 403, { error: "forbidden path" });
  let st;
  try {
    st = fs.statSync(full);
  } catch {
    return sendJson(res, 404, { error: "not found" });
  }
  if (!st.isFile()) return sendJson(res, 404, { error: "not found" });
  const real = realWithin(PUBLIC_ROOT, full);
  if (!real) return sendJson(res, 403, { error: "forbidden path" });
  return serveFile(req, res, real, st, { cache: "no-cache", csp: full.endsWith(".html") ? PAGE_CSP : undefined });
}

// ── lazily loaded, hot-reloaded modules being built in parallel ─────────────────
const MODULES = {
  styles: { file: path.join(LAB_ROOT, "lib", "styles.mjs"), needs: ["listStyles", "getStyle"] },
  batch: { file: path.join(LAB_ROOT, "lib", "batch.mjs"), needs: ["listBatches", "getBatch", "createBatch", "runPreflight"] },
};
const modCache = {};

async function loadModule(name) {
  const spec = MODULES[name];
  let st;
  try {
    st = fs.statSync(spec.file);
  } catch {
    throw new Error(`lib/${name}.mjs does not exist yet`);
  }
  const key = `${st.mtimeMs}-${st.size}`;
  const c = (modCache[name] ||= { tries: 0 });
  if (c.key === key && c.mod) return c.mod;
  if (c.key === key && c.err && Date.now() - c.at < 4000) throw c.err;
  // First load uses the canonical URL (shared with other lib importers); re-loads after an edit or a
  // failure need a fresh URL because ESM caches module records — even failed ones.
  const href = pathToFileURL(spec.file).href + (c.tries++ ? `?v=${encodeURIComponent(key)}-${c.tries}` : "");
  try {
    const mod = await import(href);
    const missing = spec.needs.filter((f) => typeof mod[f] !== "function");
    if (missing.length) throw new Error(`lib/${name}.mjs does not export ${missing.join(", ")} yet`);
    Object.assign(c, { key, mod, err: null });
    return mod;
  } catch (e) {
    // ESM never re-evaluates a module it already loaded: if lib/<name>.mjs needs a newer export of a
    // shared module (util/db…) that this process loaded at startup, only a restart can pick it up.
    const err = /does not provide an export named/.test(String(e?.message))
      ? new Error(`${e.message} — a shared lib module changed after the UI server started; restart the server`)
      : e;
    Object.assign(c, { key, mod: null, err, at: Date.now() });
    throw err;
  }
}

async function moduleReady(name) {
  try {
    await loadModule(name);
    return true;
  } catch {
    return false;
  }
}

async function withModule(name, fn) {
  let mod;
  try {
    mod = await loadModule(name);
  } catch (e) {
    throw new HttpError(503, `${name} module not ready`, { module: name, detail: String(e?.message || e).slice(0, 400) });
  }
  try {
    return await fn(mod);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof LabError || e?.constructor?.name === "LabError") throw new HttpError(e.code === "NOT_FOUND" ? 404 : 400, e.message, { code: e.code ?? null });
    if (/database is locked|SQLITE_BUSY/i.test(String(e?.message))) throw new HttpError(503, "database busy — retry in a moment");
    console.error(`✗ lib/${name}.mjs:`, e?.stack || e);
    throw new HttpError(503, `${name} module not ready`, { module: name, detail: String(e?.message || e).slice(0, 400) });
  }
}

// ── ads ──────────────────────────────────────────────────────────────────────────
const SB = (k) => `(CASE WHEN json_valid(score_breakdown) THEN json_extract(score_breakdown, '$.${k}') END)`;
const COUNTRIES = "(CASE WHEN json_valid(ads.countries) THEN ads.countries ELSE '[]' END)";
const VISUAL_ROLES = "('video','image','card_image','card_video','video_preview','card_preview','extra_image','extra_video')";
const HAS_MEDIA = `EXISTS (SELECT 1 FROM media m WHERE m.owner_kind='ad' AND m.owner_id=ads.ad_archive_id AND m.status='ok' AND m.role IN ${VISUAL_ROLES})`;
const SORTS = {
  score: "score DESC, ad_archive_id DESC",
  days: `COALESCE(${SB("days_active")}, 0) DESC, score DESC`,
  dup: "COALESCE(collation_count, 1) DESC, score DESC",
  recent: "COALESCE(start_date, 0) DESC, score DESC",
  seen: "last_seen_at DESC, score DESC",
};
const THUMB_ROLES = ["video_preview", "image", "card_image", "card_preview", "extra_image"];
const VIDEO_ROLES = ["video", "card_video", "extra_video"];
const IMAGE_ROLES = ["image", "card_image", "extra_image"];

function mediaIndex(ids) {
  const m = new Map();
  if (!ids.length) return m;
  const rows = all(
    `SELECT owner_id, role, idx, local_path, width, height, duration FROM media
     WHERE owner_kind='ad' AND status='ok' AND owner_id IN (${ids.map(() => "?").join(",")}) ORDER BY idx`,
    ...ids,
  );
  for (const r of rows) {
    if (!m.has(r.owner_id)) m.set(r.owner_id, []);
    m.get(r.owner_id).push(r);
  }
  return m;
}

function cardMedia(rows = []) {
  const pick = (roles) => {
    for (const role of roles) {
      for (const r of rows) {
        if (r.role !== role) continue;
        const url = fileUrl(r.local_path);
        if (url) return { ...r, url };
      }
    }
    return null;
  };
  const t = pick(THUMB_ROLES);
  const v = pick(VIDEO_ROLES);
  const dim = v || t;
  return {
    thumb: t?.url ?? null,
    video: v?.url ?? null,
    w: dim?.width ?? null,
    h: dim?.height ?? null,
    duration: v?.duration ?? null,
    n_videos: rows.filter((x) => VIDEO_ROLES.includes(x.role)).length,
    n_images: rows.filter((x) => IMAGE_ROLES.includes(x.role)).length,
  };
}

const evidenceFile = (id) => (AD_ID_RE.test(String(id)) ? path.join(DATA_ROOT, "evidence", String(id), "evidence.json") : null);

function adCard(r, mrows) {
  const sb = pj(r.score_breakdown, {}) || {};
  const ev = evidenceFile(r.ad_archive_id);
  return {
    id: r.ad_archive_id,
    page_id: r.page_id,
    page_name: r.page_name,
    is_active: r.is_active,
    start_date: r.start_date,
    end_date: r.end_date,
    format: sb.format || (r.display_format ? String(r.display_format).toLowerCase() : null),
    display_format: r.display_format,
    tier: sb.tier ?? null,
    winner: !!sb.winner,
    days_active: sb.days_active ?? null,
    score: r.score,
    relevance: r.relevance,
    dup: r.collation_count ?? 1,
    countries: asArray(r.countries),
    platforms: asArray(r.platforms),
    lang: r.lang,
    title: r.title,
    body: clip(r.body, 360),
    cta_type: r.cta_type,
    cta_text: r.cta_text,
    link_domain: r.link_domain,
    starred: !!r.starred,
    hidden: !!r.hidden,
    has_dna: !!r.has_dna,
    has_evidence: !!(ev && fs.existsSync(ev)),
    variants: r.cluster_size || 1,
    segment: r.segment || "local",
    brand: r.brand || null,
    ...cardMedia(mrows),
  };
}

/** Compact ad summaries (for style refs, DNA list). */
function adSummaries(ids) {
  const uniq = [...new Set(ids.filter((x) => AD_ID_RE.test(String(x))).map(String))];
  const out = new Map();
  if (!uniq.length) return out;
  const rows = all(
    `SELECT ad_archive_id, page_id, page_name, is_active, start_date, end_date, display_format, platforms, body, title, cta_type, cta_text,
            link_domain, countries, lang, relevance, score, score_breakdown, collation_count, starred, hidden, cluster_size, segment,
            (SELECT brand FROM pages pg WHERE pg.page_id = ads.page_id) AS brand,
            EXISTS (SELECT 1 FROM dna d WHERE d.ref_id = ads.ad_archive_id) AS has_dna
     FROM ads WHERE ad_archive_id IN (${uniq.map(() => "?").join(",")})`,
    ...uniq,
  );
  const mi = mediaIndex(rows.map((r) => r.ad_archive_id));
  for (const r of rows) out.set(r.ad_archive_id, adCard(r, mi.get(r.ad_archive_id)));
  return out;
}

function apiAds({ query }) {
  const where = ["relevance >= ?"];
  const args = [num(query.get("minRelevance"), MIN_REL())];
  where.push(truthy(query.get("hidden")) ? "hidden = 1" : "hidden = 0");
  const country = (query.get("country") || "").trim();
  if (country) {
    where.push(`EXISTS (SELECT 1 FROM json_each(${COUNTRIES}) WHERE value = ?)`);
    args.push(country.toUpperCase());
  }
  for (const [param, key] of [["format", "format"], ["tier", "tier"]]) {
    const v = (query.get(param) || "").trim();
    if (v) {
      where.push(`${SB(key)} = ?`);
      args.push(v);
    }
  }
  const lang = (query.get("lang") || "").trim();
  if (lang) {
    where.push("lang = ?");
    args.push(lang);
  }
  const minDays = num(query.get("minDays"), 0);
  if (minDays > 0) {
    where.push(`COALESCE(${SB("days_active")}, 0) >= ?`);
    args.push(minDays);
  }
  if (truthy(query.get("winner"))) where.push(`${SB("winner")} = 1`);
  if (truthy(query.get("starred"))) where.push("starred = 1");
  // Curated by default: one representative per creative cluster, and only ads whose creative is cached.
  // ?all=1 shows everything (duplicates + ads whose media never downloaded).
  if (!truthy(query.get("all"))) where.push("is_rep = 1", HAS_MEDIA);
  else if (truthy(query.get("media"))) where.push(HAS_MEDIA);
  const segment = (query.get("segment") || "").trim();
  if (segment === "premium" || segment === "local") {
    where.push("segment = ?");
    args.push(segment);
  }
  const pageId = (query.get("page") || "").trim();
  if (pageId) {
    where.push("page_id = ?");
    args.push(pageId);
  }
  const q = (query.get("q") || "").trim().slice(0, 200);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const cols = ["body", "title", "page_name", "link_url", "link_description"].map((c) => `${c} LIKE ? ESCAPE '\\'`);
    where.push(`(${cols.join(" OR ")} OR ad_archive_id = ?)`);
    args.push(like, like, like, like, like, q);
  }
  const sort = Object.hasOwn(SORTS, query.get("sort") || "") ? query.get("sort") : "score";
  const limit = Math.min(200, Math.max(1, Math.floor(num(query.get("limit"), 48))));
  const offset = Math.min(1e6, Math.max(0, Math.floor(num(query.get("offset"), 0))));
  const W = where.join(" AND ");
  const total = get(`SELECT COUNT(*) AS n FROM ads WHERE ${W}`, ...args).n;
  const rows = all(
    `SELECT ad_archive_id, page_id, page_name, is_active, start_date, end_date, display_format, platforms, body, title, cta_type, cta_text,
            link_domain, countries, lang, relevance, score, score_breakdown, collation_count, starred, hidden, cluster_size, segment,
            (SELECT brand FROM pages pg WHERE pg.page_id = ads.page_id) AS brand,
            EXISTS (SELECT 1 FROM dna d WHERE d.ref_id = ads.ad_archive_id) AS has_dna
     FROM ads WHERE ${W} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`,
    ...args,
    limit,
    offset,
  );
  const mi = mediaIndex(rows.map((r) => r.ad_archive_id));
  return { total, offset, limit, sort, items: rows.map((r) => adCard(r, mi.get(r.ad_archive_id))) };
}

function readEvidence(id) {
  const dir = path.join(DATA_ROOT, "evidence", id);
  try {
    if (!fs.statSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  const ev = readJson(path.join(dir, "evidence.json"), null);
  const files = listFiles(dir, 2)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .slice(0, 160)
    .map((f) => ({ name: path.relative(dir, f).split(path.sep).join("/"), url: fileUrl(f) }))
    .filter((f) => f.url);
  const items = (Array.isArray(ev?.items) ? ev.items : []).map((it) =>
    it?.kind === "video"
      ? {
          kind: "video",
          role: it.role ?? null,
          idx: it.idx ?? 0,
          duration: it.duration ?? null,
          aspect: it.aspect ?? null,
          shots: it.shots ?? null,
          lufs: it.lufs ?? null,
          has_audio: it.has_audio ?? null,
          transcript: Array.isArray(it.transcript) ? it.transcript : [],
          transcript_model: it.transcript_model ?? null,
          sheet: fileUrl(it.sheet),
          hook_strip: fileUrl(it.hook_strip),
          keyframes: (Array.isArray(it.keyframes) ? it.keyframes : []).map((k) => ({ name: path.basename(String(k)), url: fileUrl(k) })).filter((k) => k.url),
          vkit_ok: it.vkit_ok ?? null,
          vkit_error: it.vkit_error ?? null,
        }
      : {
          kind: it?.kind || "image",
          montage: fileUrl(it?.montage),
          images: (Array.isArray(it?.images) ? it.images : []).map((im) => ({
            role: im.role ?? null,
            idx: im.idx ?? 0,
            url: fileUrl(im.file),
            w: im.w ?? null,
            h: im.h ?? null,
            aspect: im.aspect ?? null,
            palette: Array.isArray(im.palette) ? im.palette : [],
          })),
        },
  );
  return { built_at: ev?.built_at ?? null, items, files, markdown: fileUrl(path.join(dir, "EVIDENCE.md")) };
}

function apiAd({ params: [id] }) {
  if (!AD_ID_RE.test(id)) throw new HttpError(404, "ad not found");
  const row = get("SELECT * FROM ads WHERE ad_archive_id = ?", id);
  if (!row) throw new HttpError(404, "ad not found");
  const { snapshot, ...ad } = row;
  const snap = pj(snapshot, {}) || {};
  const page = ad.page_id ? get("SELECT * FROM pages WHERE page_id = ?", ad.page_id) : null;
  const media = all(
    `SELECT id, role, idx, local_path, mime, width, height, duration, status, bytes, error, expires_at, created_at FROM media
     WHERE owner_kind='ad' AND owner_id = ?
     ORDER BY CASE role WHEN 'video' THEN 0 WHEN 'card_video' THEN 1 WHEN 'extra_video' THEN 2 WHEN 'image' THEN 3 WHEN 'card_image' THEN 4
              WHEN 'extra_image' THEN 5 WHEN 'video_preview' THEN 6 WHEN 'card_preview' THEN 7 ELSE 8 END, idx`,
    id,
  ).map((m) => ({ ...m, error: m.error ? String(m.error).replace(/https?:\/\/\S+/g, "<url>") : null, url: m.status === "ok" ? fileUrl(m.local_path) : null }));
  const sightings = all(
    `SELECT s.crawl_id, s.seen_at, s.is_active, s.collation_count, s.rank, s.n, s.sort, c.params
     FROM sightings s LEFT JOIN crawls c ON c.id = s.crawl_id WHERE s.ad_archive_id = ? ORDER BY s.seen_at DESC LIMIT 40`,
    id,
  ).map(({ params, ...s }) => {
    const p = pj(params, {}) || {};
    return { ...s, q: p.q ?? null, page_id: p.pageId ?? null, country: p.country ?? null, market: p.market ?? null };
  });
  const extraTexts = (Array.isArray(snap.extra_texts) ? snap.extra_texts : [])
    .map((t) => (typeof t === "string" ? t : t?.text))
    .filter((t) => typeof t === "string" && t.trim())
    .slice(0, 12);
  let dna = null;
  try {
    dna = getDna(id);
  } catch {}
  return {
    ad: {
      ...ad,
      platforms: asArray(ad.platforms),
      cards: asArray(ad.cards),
      countries: asArray(ad.countries),
      queries: asArray(ad.queries),
      tags: asArray(ad.tags),
      score_breakdown: pj(ad.score_breakdown, {}) || {},
      starred: !!ad.starred,
      hidden: !!ad.hidden,
    },
    page: page ? { ...page, categories: asArray(page.categories) } : null,
    media,
    dna,
    evidence: readEvidence(id),
    library_url: `https://www.facebook.com/ads/library/?id=${encodeURIComponent(id)}`,
    sightings,
    weights: config().scoring?.weights ?? {},
    extra: {
      extra_texts: extraTexts,
      page_like_count: snap.page_like_count ?? null,
      byline: snap.byline ?? null,
      disclaimer_label: snap.disclaimer_label ?? null,
      reach: snap._top?.reach_estimate ?? null,
      targeted_or_reached_countries: snap._top?.targeted_or_reached_countries ?? null,
    },
  };
}

async function apiAdFlag({ req, params: [id, kind] }) {
  if (!AD_ID_RE.test(id)) throw new HttpError(404, "ad not found");
  const body = await jsonBody(req);
  if (typeof body?.on !== "boolean") throw bad('body must be {"on": true|false}');
  const col = kind === "star" ? "starred" : "hidden";
  const r = run(`UPDATE ads SET ${col} = ? WHERE ad_archive_id = ?`, body.on ? 1 : 0, id);
  if (!r.changes) throw new HttpError(404, "ad not found");
  const row = get("SELECT starred, hidden FROM ads WHERE ad_archive_id = ?", id);
  return { ok: true, id, starred: !!row.starred, hidden: !!row.hidden };
}

// ── stats / dna / taxonomy ───────────────────────────────────────────────────────
async function apiStats() {
  const minRel = MIN_REL();
  const n = (sql, ...a) => {
    try {
      return get(sql, ...a)?.n ?? 0;
    } catch {
      return null;
    }
  };
  const facet = (expr, from = "ads") => {
    try {
      return all(`SELECT ${expr} AS value, COUNT(*) AS n FROM ${from} WHERE ads.relevance >= ? AND ads.hidden = 0 GROUP BY value ORDER BY n DESC`, minRel).filter((r) => r.value !== null && r.value !== "");
    } catch {
      return [];
    }
  };
  let evidence = 0;
  try {
    evidence = fs.readdirSync(path.join(DATA_ROOT, "evidence"), { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch {}
  const [stylesReady, batchReady] = await Promise.all([moduleReady("styles"), moduleReady("batch")]);
  let styles = n("SELECT COUNT(*) AS n FROM styles");
  let batches = n("SELECT COUNT(*) AS n FROM batches");
  if (stylesReady) {
    try {
      styles = (await (await loadModule("styles")).listStyles())?.length ?? styles;
    } catch {}
  }
  if (batchReady) {
    try {
      batches = (await (await loadModule("batch")).listBatches())?.length ?? batches;
    } catch {}
  }
  return {
    ads: n("SELECT COUNT(*) AS n FROM ads"),
    in_niche: n("SELECT COUNT(*) AS n FROM ads WHERE relevance >= ?", minRel),
    winners: n(`SELECT COUNT(*) AS n FROM ads WHERE relevance >= ? AND ${SB("winner")} = 1`, minRel),
    winners_all: n(`SELECT COUNT(*) AS n FROM ads WHERE ${SB("winner")} = 1`),
    with_media: n(`SELECT COUNT(*) AS n FROM ads WHERE relevance >= ? AND ${HAS_MEDIA}`, minRel),
    curated: n(`SELECT COUNT(*) AS n FROM ads WHERE relevance >= ? AND hidden = 0 AND is_rep = 1 AND ${HAS_MEDIA}`, minRel),
    curated_local: n(`SELECT COUNT(*) AS n FROM ads WHERE relevance >= ? AND hidden = 0 AND is_rep = 1 AND segment = 'local' AND ${HAS_MEDIA}`, minRel),
    curated_premium: n(`SELECT COUNT(*) AS n FROM ads WHERE relevance >= ? AND hidden = 0 AND is_rep = 1 AND segment = 'premium' AND ${HAS_MEDIA}`, minRel),
    briefs: n("SELECT COUNT(*) AS n FROM briefs"),
    starred: n("SELECT COUNT(*) AS n FROM ads WHERE starred = 1"),
    hidden: n("SELECT COUNT(*) AS n FROM ads WHERE hidden = 1"),
    pages: n("SELECT COUNT(*) AS n FROM pages"),
    analysed: n("SELECT COUNT(*) AS n FROM dna"),
    evidence,
    styles,
    products: n("SELECT COUNT(*) AS n FROM products"),
    products_in_stock: n("SELECT COUNT(*) AS n FROM products WHERE in_stock = 1"),
    batches,
    last_crawl: get("SELECT MAX(COALESCE(finished_at, started_at)) AS t FROM crawls")?.t ?? null,
    min_relevance: minRel,
    facets: {
      countries: facet("je.value", `ads, json_each(${COUNTRIES}) je`),
      formats: facet(SB("format")),
      tiers: facet(SB("tier")),
      langs: facet("lang"),
    },
    modules: { styles: stylesReady, batch: batchReady },
    kie: { usd_per_credit: config().kie?.usd_per_credit ?? null, max_credits_per_batch: config().kie?.max_credits_per_batch ?? null },
  };
}

function apiDna() {
  const list = listDna();
  const sums = adSummaries(list.map((d) => d.id));
  return list.map((d) => ({ ...d, ad: sums.get(String(d.id)) || null }));
}

const apiTaxonomy = () => readJson(labPath("config/taxonomy.json"), {});

// ── styles ───────────────────────────────────────────────────────────────────────
function withRefAds(styles) {
  const ids = styles.flatMap((s) => (Array.isArray(s?.refs) ? s.refs : []).filter((r) => r?.kind === "adlib" && r.id).map((r) => String(r.id)));
  const sums = adSummaries(ids);
  return styles.map((s) =>
    s && typeof s === "object"
      ? { ...s, refs: (Array.isArray(s.refs) ? s.refs : []).map((r) => ({ ...r, ad: r?.kind === "adlib" ? sums.get(String(r.id)) || null : null })) }
      : s,
  );
}

const apiStyles = () =>
  withModule("styles", async (m) => {
    const list = await m.listStyles();
    return withRefAds(Array.isArray(list) ? list : []);
  });

function apiStyle({ params: [id] }) {
  if (!STYLE_ID_RE.test(id)) throw new HttpError(404, "style not found");
  return withModule("styles", async (m) => {
    const s = await m.getStyle(id);
    if (!s) throw new HttpError(404, "style not found");
    return withRefAds([s])[0];
  });
}

// ── products ─────────────────────────────────────────────────────────────────────
function productOut(p, full = false) {
  if (!p) return null;
  const refs = (Array.isArray(p.refs) ? p.refs : []).map((r, idx) => {
    const local = fileUrl(r?.path);
    return {
      idx,
      role: r?.role ?? null,
      source: r?.source ?? null,
      approved: r?.approved !== false,
      note: r?.note ?? null,
      w: r?.w ?? null,
      h: r?.h ?? null,
      src: local || (isHttp(r?.url) ? r.url : null),
      local: !!local,
      thumb: fileUrl(r?.path ? r.path.replace(/\.(png|jpe?g|webp)$/i, ".thumb.jpg") : null) || local || (isHttp(r?.url) ? r.url : null),
    };
  });
  const hero = refs.find((r) => r.approved && r.src) || refs.find((r) => r.src);
  const out = {
    slug: p.slug,
    name: p.name || {},
    category: p.category ?? null,
    gender: p.gender ?? null,
    price: p.price ?? null,
    compareAt: p.compareAt ?? null,
    inStock: !!p.inStock,
    badge: p.badge ?? null,
    freeGift: p.freeGift ?? null,
    freeGiftImage: isHttp(p.freeGiftImage) ? p.freeGiftImage : null,
    colors: Array.isArray(p.colors) ? p.colors : [],
    sizes: p.sizes ?? null,
    url: isHttp(p.url) ? p.url : null,
    sortOrder: p.sortOrder ?? null,
    source: p.source ?? null,
    synced_at: p.synced_at ?? null,
    partial: !!p._partial,
    refs,
    thumb: hero?.thumb || hero?.src || (Array.isArray(p.images) && isHttp(p.images[0]) ? p.images[0] : null),
    approved_refs: refs.filter((r) => r.approved).length,
  };
  if (full) Object.assign(out, { description: p.description ?? null, details: p.details ?? null, images: Array.isArray(p.images) ? p.images : [] });
  return out;
}

const apiProducts = ({ query }) => listProducts({ inStockOnly: truthy(query.get("inStock")) }).map((p) => productOut(p));

function apiProduct({ params: [slug] }) {
  if (!SLUG_RE.test(slug)) throw new HttpError(404, "product not found");
  const p = getProduct(slug);
  if (!p) throw new HttpError(404, "product not found");
  return productOut(p, true);
}

async function apiRefApprove({ req, params: [slug, idx] }) {
  if (!SLUG_RE.test(slug)) throw new HttpError(404, "product not found");
  const body = await jsonBody(req);
  if (typeof body?.approved !== "boolean") throw bad('body must be {"approved": true|false}');
  try {
    setRefApproval(slug, Number(idx), body.approved);
  } catch (e) {
    if (e instanceof LabError && e.code === "NOT_FOUND") throw new HttpError(404, e.message);
    throw e;
  }
  return productOut(getProduct(slug), true);
}

// ── batches ──────────────────────────────────────────────────────────────────────
function resolveOutputs(outputs) {
  return asArray(outputs)
    .map((x) => {
      const p = typeof x === "string" ? x : x?.path ?? x?.local_path ?? x?.file ?? null;
      const remote = typeof x === "string" ? (isHttp(x) ? x : null) : isHttp(x?.url) ? x.url : isHttp(p) ? p : null;
      const url = p && !isHttp(p) ? fileUrl(p) : null;
      const name = String(p || remote || "").split(/[\\/]/).pop().split("?")[0];
      const kind = /\.(mp4|webm|mov|m4v)$/i.test(name) ? "video" : /\.(png|jpe?g|webp|gif|avif)$/i.test(name) ? "image" : "file";
      return { url, remote, name, kind };
    })
    .filter((o) => o.url || o.remote);
}

function scanRenders(batchId, jobId) {
  if (!BATCH_ID_RE.test(String(batchId)) || !BATCH_ID_RE.test(String(jobId))) return [];
  const dir = path.join(DATA_ROOT, "batches", String(batchId), "jobs", String(jobId), "renders");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(mp4|webm|mov|png|jpe?g|webp)$/i.test(f))
      .map((f) => ({ name: f, url: fileUrl(path.join(dir, f)), kind: /\.(mp4|webm|mov)$/i.test(f) ? "video" : "image" }))
      .filter((x) => x.url);
  } catch {
    return [];
  }
}

async function enrichBatch(b) {
  if (!b || typeof b !== "object") return b;
  const styleNames = new Map();
  try {
    const sm = await loadModule("styles");
    for (const s of (await sm.listStyles()) || []) if (s?.id) styleNames.set(String(s.id), s.name || null);
  } catch {}
  const prodCache = new Map();
  const product = (slug) => {
    if (!slug) return null;
    if (!prodCache.has(slug)) {
      let p = null;
      try {
        p = productOut(getProduct(slug));
      } catch {}
      prodCache.set(slug, p && { slug: p.slug, name: p.name, price: p.price, compareAt: p.compareAt, thumb: p.thumb, inStock: p.inStock, category: p.category, freeGift: p.freeGift });
    }
    return prodCache.get(slug);
  };
  const verdicts = { PASS: 0, WARN: 0, BLOCK: 0, none: 0 };
  const jobs = (Array.isArray(b.jobs) ? b.jobs : []).map((j) => {
    const styleIds = asArray(j?.style_ids).map(String);
    const pf = asObj(j?.preflight);
    const v = String(pf?.verdict || "").toUpperCase();
    if (Object.hasOwn(verdicts, v) && v !== "none") verdicts[v]++;
    else verdicts.none++;
    return {
      ...j,
      spec: asObj(j?.spec) ?? j?.spec ?? null,
      style_ids: styleIds,
      preflight: pf,
      tasks: (Array.isArray(j?.tasks) ? j.tasks : []).map((t) => ({ ...t, request: asObj(t?.request) ?? t?.request ?? null, output_files: resolveOutputs(t?.outputs) })),
      assets: (Array.isArray(j?.assets) ? j.assets : []).map((a) => ({ ...a, url: fileUrl(a?.path) })),
      ops: (Array.isArray(j?.ops) ? j.ops : []).map((o) => ({ ...o, output_url: fileUrl(typeof o?.output === "string" ? o.output : o?.output?.path) })),
      product_info: product(j?.product_slug),
      style_info: styleIds.map((id) => ({ id, name: styleNames.get(id) ?? null })),
      renders: scanRenders(b.id, j?.id),
    };
  });
  return {
    ...b,
    settings: asObj(b.settings) ?? b.settings ?? {},
    jobs,
    verdicts,
    generate_command: genCommand(b.id),
    usd_per_credit: config().kie?.usd_per_credit ?? null,
    max_credits_per_batch: config().kie?.max_credits_per_batch ?? null,
  };
}

const apiBatches = () =>
  withModule("batch", async (m) => {
    const list = await m.listBatches();
    return (Array.isArray(list) ? list : []).map((b) => ({ ...b, generate_command: genCommand(b?.id) }));
  });

function apiBatch({ params: [id] }) {
  if (!BATCH_ID_RE.test(id)) throw new HttpError(404, "batch not found");
  return withModule("batch", async (m) => {
    const b = await m.getBatch(id);
    if (!b) throw new HttpError(404, "batch not found");
    return enrichBatch(b);
  });
}

function validateBatchBody(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw bad("body must be a JSON object {name, items, settings}");
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 80) throw bad("name is required (1–80 characters)");
  if (!Array.isArray(b.items) || !b.items.length) throw bad("items must be a non-empty array of {product, styles, placements?}");
  if (b.items.length > 60) throw bad("at most 60 items per batch");
  const items = b.items.map((it, i) => {
    const product = typeof it?.product === "string" ? it.product.trim() : "";
    if (!SLUG_RE.test(product)) throw bad(`items[${i}].product must be a product slug`);
    if (!get("SELECT 1 AS ok FROM products WHERE slug = ?", product)) throw bad(`unknown product: ${product}`);
    const styles = Array.isArray(it.styles) ? [...new Set(it.styles.map((s) => String(s).trim()))] : [];
    if (!styles.length || styles.length > 6) throw bad(`items[${i}].styles must list 1–6 style ids`);
    const badStyle = styles.find((s) => !STYLE_ID_RE.test(s));
    if (badStyle) throw bad(`invalid style id: ${badStyle}`);
    const out = { product, styles };
    if (it.placements !== undefined) out.placements = checkPlacements(it.placements, `items[${i}].placements`);
    if (it.lang !== undefined) out.lang = checkLang(it.lang, `items[${i}].lang`);
    return out;
  });
  // Whitelist: batch.mjs turns some settings into paths (settings.id → data/batches/<id>/), so nothing
  // unvetted from the request body reaches it. The id is always generated by the batch module.
  const s = b.settings && typeof b.settings === "object" && !Array.isArray(b.settings) ? b.settings : {};
  const settings = {};
  if (s.lang !== undefined) settings.lang = checkLang(s.lang, "settings.lang");
  if (s.draft !== undefined) {
    if (typeof s.draft !== "boolean") throw bad("settings.draft must be true or false");
    settings.draft = s.draft;
  }
  if (s.placements !== undefined) settings.placements = checkPlacements(s.placements, "settings.placements");
  return { name, items, settings };
}

function checkPlacements(v, label) {
  if (!Array.isArray(v) || !v.length || v.some((p) => !PLACEMENTS.has(p))) throw bad(`${label} must be a non-empty subset of ${[...PLACEMENTS].join(", ")}`);
  return [...new Set(v)];
}

function checkLang(v, label) {
  if (!LANGS.has(v)) throw bad(`${label} must be one of ${[...LANGS].join(", ")}`);
  return v;
}

async function apiBatchCreate({ req }) {
  const input = validateBatchBody(await jsonBody(req));
  return withModule("batch", async (m) => new Reply(201, await enrichBatch(await m.createBatch(input))));
}

function apiBatchPreflight({ params: [id] }) {
  if (!BATCH_ID_RE.test(id)) throw new HttpError(404, "batch not found");
  return withModule("batch", async (m) => {
    const b = await m.runPreflight(id);
    if (!b) throw new HttpError(404, "batch not found");
    return enrichBatch(b);
  });
}

// ── briefs (reference + product + format → code for Claude) ─────────────────────
const briefsMod = await import("../lib/briefs.mjs");
function briefOut(b) {
  if (!b) return null;
  const p = getProduct(b.product_slug);
  const ref = b.source_kind === "ad" ? adSummaries([b.source_id]).get(b.source_id) || null : null;
  return { ...b, product: p ? { slug: p.slug, name: p.name, price: p.price, thumb: fileUrl(p.refs?.[0]?.path?.replace(/\.(png|jpe?g|webp)$/i, ".thumb.jpg")) || fileUrl(p.refs?.[0]?.path), photos: (p.refs || []).filter((r) => r.approved !== false).map((r) => ({ url: r.url, role: r.role, file: fileUrl(r.path) })) } : null, reference: ref };
}
function apiBriefs() {
  return briefsMod.listBriefs(200).map(briefOut);
}
function apiBrief({ params: [code] }) {
  const b = briefsMod.getBrief(code);
  if (!b) throw new HttpError(404, "code not found");
  return briefOut(b);
}
async function apiBriefCreate({ req }) {
  const body = await jsonBody(req);
  try {
    return new Reply(201, briefOut(briefsMod.createBrief(body || {})));
  } catch (e) {
    throw bad(e.message);
  }
}

// ── routing ──────────────────────────────────────────────────────────────────────
const ROUTES = [
  ["GET", /^\/api\/stats$/, apiStats],
  ["GET", /^\/api\/ads$/, apiAds],
  ["GET", /^\/api\/ads\/([^/]+)$/, apiAd],
  ["POST", /^\/api\/ads\/([^/]+)\/(star|hide)$/, apiAdFlag],
  ["GET", /^\/api\/dna$/, apiDna],
  ["GET", /^\/api\/taxonomy$/, apiTaxonomy],
  ["GET", /^\/api\/styles$/, apiStyles],
  ["GET", /^\/api\/styles\/([^/]+)$/, apiStyle],
  ["GET", /^\/api\/products$/, apiProducts],
  ["GET", /^\/api\/products\/([^/]+)$/, apiProduct],
  ["POST", /^\/api\/products\/([^/]+)\/refs\/(\d{1,4})\/approve$/, apiRefApprove],
  ["GET", /^\/api\/batches$/, apiBatches],
  ["POST", /^\/api\/batches$/, apiBatchCreate],
  ["GET", /^\/api\/batches\/([^/]+)$/, apiBatch],
  ["POST", /^\/api\/batches\/([^/]+)\/preflight$/, apiBatchPreflight],
  ["GET", /^\/api\/briefs$/, apiBriefs],
  ["POST", /^\/api\/briefs$/, apiBriefCreate],
  ["GET", /^\/api\/briefs\/([^/]+)$/, apiBrief],
];

async function handleApi(req, res, rawPath, query) {
  if (req.method === "POST") {
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(String(origin).toLowerCase())) throw new HttpError(403, "cross-origin request refused");
  }
  const allowed = [];
  for (const [method, re, fn] of ROUTES) {
    const m = re.exec(rawPath);
    if (!m) continue;
    if (req.method !== method && !(method === "GET" && req.method === "HEAD")) {
      allowed.push(method);
      continue;
    }
    const params = m.slice(1).map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        throw bad("bad URL encoding");
      }
    });
    const out = await fn({ req, res, params, query });
    if (out instanceof Reply) return sendJson(res, out.status, out.body);
    return sendJson(res, 200, out ?? null);
  }
  if (allowed.length) throw new HttpError(405, "method not allowed", { allow: allowed });
  throw new HttpError(404, "no such endpoint");
}

async function handle(req, res) {
  if (!ALLOWED_HOSTS.has(String(req.headers.host || "").toLowerCase())) return sendJson(res, 421, { error: "unexpected Host header" });
  const rawUrl = req.url || "/";
  const qi = rawUrl.indexOf("?");
  const rawPath = qi === -1 ? rawUrl : rawUrl.slice(0, qi);
  const query = new URLSearchParams(qi === -1 ? "" : rawUrl.slice(qi + 1));
  if (rawPath.startsWith("/api/")) return handleApi(req, res, rawPath, query);
  if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "method not allowed" }, { Allow: "GET, HEAD" });
  if (rawPath === "/files" || rawPath.startsWith("/files/")) return serveData(req, res, rawPath.slice("/files/".length));
  return serveStatic(req, res, rawPath);
}

function onError(res, e) {
  let status = 500;
  let body = { error: "internal error" };
  if (e instanceof HttpError) {
    status = e.status;
    body = { error: e.message, ...e.extra };
  } else if (/database is locked|SQLITE_BUSY/i.test(String(e?.message))) {
    status = 503;
    body = { error: "database busy — retry in a moment" };
  } else {
    console.error("✗", e?.stack || e);
    body.detail = String(e?.message || e).slice(0, 400);
  }
  if (res.headersSent) return res.destroy();
  sendJson(res, status, body, status === 405 && e.extra?.allow ? { Allow: e.extra.allow.join(", ") } : {});
}

const server = http.createServer((req, res) => {
  const t0 = Date.now();
  handle(req, res)
    .catch((e) => onError(res, e))
    .finally(() => {
      if (VERBOSE || res.statusCode >= 500) console.log(`${req.method} ${req.url} → ${res.statusCode} (${Date.now() - t0} ms)`);
    });
});
server.keepAliveTimeout = 5000;
server.on("clientError", (_err, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});
server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `✗ port ${PORT} is already in use — pass --port <n>` : `✗ ${e.message}`);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`creative-lab UI → http://${HOST}:${PORT}/   (read-mostly; generation stays CLI-only)`);
});

function shutdown() {
  server.close();
  try {
    closeDb();
  } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

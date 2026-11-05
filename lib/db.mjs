// creative-lab :: SQLite library (node:sqlite, built into Node >= 22.13).
// One file DB at data/lab.db (override with LAB_DB for tests). Schema is created
// by ordered, idempotent migrations recorded in the `meta` table.

import fs from "node:fs";
import path from "node:path";
import { labPath, config, nowIso } from "./util.mjs";

// node:sqlite prints an ExperimentalWarning on import; silence only that one.
const _emit = process.emitWarning;
process.emitWarning = function (w, ...rest) {
  const msg = typeof w === "string" ? w : w?.message;
  if (msg && /SQLite is an experimental feature/i.test(msg)) return;
  return _emit.call(process, w, ...rest);
};
const { DatabaseSync } = await import("node:sqlite");

const MIGRATIONS = [
  // 1 — core library
  `
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);

  CREATE TABLE IF NOT EXISTS crawls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    params TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    reported_total INTEGER,
    results INTEGER NOT NULL DEFAULT 0,
    new_ads INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS pages (
    page_id TEXT PRIMARY KEY,
    page_name TEXT,
    like_count INTEGER,
    categories TEXT,
    profile_uri TEXT,
    first_seen_at TEXT,
    last_seen_at TEXT,
    active_ads_seen INTEGER NOT NULL DEFAULT 0,
    is_competitor INTEGER NOT NULL DEFAULT 0,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS ads (
    ad_archive_id TEXT PRIMARY KEY,
    collation_id TEXT,
    collation_count INTEGER,
    page_id TEXT,
    page_name TEXT,
    is_active INTEGER,
    start_date INTEGER,
    end_date INTEGER,
    display_format TEXT,
    platforms TEXT,
    body TEXT,
    title TEXT,
    link_url TEXT,
    link_domain TEXT,
    caption TEXT,
    link_description TEXT,
    cta_text TEXT,
    cta_type TEXT,
    cards TEXT,
    countries TEXT,
    queries TEXT,
    contains_ai_media INTEGER,
    first_seen_at TEXT,
    last_seen_at TEXT,
    seen_count INTEGER NOT NULL DEFAULT 1,
    lang TEXT,
    relevance REAL,
    score REAL,
    score_breakdown TEXT,
    media_status TEXT NOT NULL DEFAULT 'none',
    starred INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    tags TEXT,
    notes TEXT,
    snapshot TEXT
  );
  CREATE INDEX IF NOT EXISTS ads_page ON ads(page_id);
  CREATE INDEX IF NOT EXISTS ads_score ON ads(score);
  CREATE INDEX IF NOT EXISTS ads_collation ON ads(collation_id);

  CREATE TABLE IF NOT EXISTS sightings (
    ad_archive_id TEXT NOT NULL,
    crawl_id INTEGER NOT NULL,
    seen_at TEXT NOT NULL,
    is_active INTEGER,
    collation_count INTEGER,
    PRIMARY KEY (ad_archive_id, crawl_id)
  );

  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_kind TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    role TEXT NOT NULL,
    idx INTEGER NOT NULL DEFAULT 0,
    source_url TEXT,
    local_path TEXT,
    sha256 TEXT,
    bytes INTEGER,
    mime TEXT,
    width INTEGER,
    height INTEGER,
    duration REAL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    created_at TEXT,
    UNIQUE(owner_kind, owner_id, role, idx)
  );
  CREATE INDEX IF NOT EXISTS media_sha ON media(sha256);

  CREATE TABLE IF NOT EXISTS dna (
    ref_id TEXT PRIMARY KEY,
    ref_kind TEXT NOT NULL,
    json TEXT NOT NULL,
    evidence_dir TEXT,
    analyst TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS styles (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    json TEXT NOT NULL,
    refs TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    slug TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    source TEXT,
    in_stock INTEGER,
    synced_at TEXT,
    refs TEXT
  );

  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT NOT NULL,
    settings TEXT,
    created_at TEXT,
    updated_at TEXT,
    est_credits REAL,
    est_usd REAL,
    spent_credits REAL NOT NULL DEFAULT 0,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    product_slug TEXT,
    style_ids TEXT,
    spec TEXT,
    preflight TEXT,
    status TEXT NOT NULL,
    est_credits REAL,
    est_usd REAL,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS jobs_batch ON jobs(batch_id);

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    shot_id TEXT NOT NULL,
    candidate INTEGER NOT NULL DEFAULT 0,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    request TEXT,
    provider_task_id TEXT,
    state TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    result_urls TEXT,
    outputs TEXT,
    est_credits REAL,
    credits REAL,
    error TEXT,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS tasks_job ON tasks(job_id);

  CREATE TABLE IF NOT EXISTS qa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    verdict TEXT NOT NULL,
    score REAL,
    json TEXT,
    created_at TEXT
  );
  CREATE INDEX IF NOT EXISTS qa_target ON qa(target_kind, target_id);

  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    job_id TEXT,
    kind TEXT NOT NULL,
    placement TEXT,
    path TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    lineage TEXT,
    meta_ad_id TEXT,
    perf TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS uploads (
    sha256 TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    url TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    expires_at TEXT
  );
  `,
  // 2 — impression-sorted rank signal (web Ad Library honours sort_data=total_impressions)
  `
  ALTER TABLE sightings ADD COLUMN rank INTEGER;
  ALTER TABLE sightings ADD COLUMN n INTEGER;
  ALTER TABLE sightings ADD COLUMN sort TEXT;
  ALTER TABLE ads ADD COLUMN best_imp_pct REAL;
  ALTER TABLE ads ADD COLUMN relaunch_count INTEGER;
  `,
  // 3 — signed media URL expiry (hex oe= param)
  `
  ALTER TABLE media ADD COLUMN expires_at INTEGER;
  `,
  // 4 — staged generation (A = stills/cut-outs/plates, B = harmonise/motion), selection, local ops
  `
  ALTER TABLE tasks ADD COLUMN stage TEXT;
  ALTER TABLE tasks ADD COLUMN route TEXT;
  ALTER TABLE tasks ADD COLUMN placement TEXT;
  ALTER TABLE tasks ADD COLUMN selected INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE tasks ADD COLUMN depends TEXT;
  ALTER TABLE tasks ADD COLUMN batch_id TEXT;
  CREATE INDEX IF NOT EXISTS tasks_batch ON tasks(batch_id);
  CREATE TABLE IF NOT EXISTS ops (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    shot_id TEXT,
    placement TEXT,
    inputs TEXT,
    depends TEXT,
    state TEXT NOT NULL DEFAULT 'planned',
    output TEXT,
    meta TEXT,
    error TEXT,
    updated_at TEXT
  );
  `,
  // 5 — upload cache keyed by (file hash, upload endpoint): a cached mock URL must never leak into a live run
  `
  CREATE TABLE IF NOT EXISTS upload_cache (
    sha256 TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    url TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    expires_at TEXT,
    PRIMARY KEY (sha256, endpoint)
  );
  `,
  // 6 — library curation: one representative per creative cluster, premium big-brand segment,
  //     and "briefs" (ad + product + format → short code Claude turns into a ready-to-paste video prompt)
  `
  ALTER TABLE ads ADD COLUMN cluster_key TEXT;
  ALTER TABLE ads ADD COLUMN cluster_size INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE ads ADD COLUMN is_rep INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE ads ADD COLUMN segment TEXT NOT NULL DEFAULT 'local';
  ALTER TABLE pages ADD COLUMN segment TEXT;
  ALTER TABLE pages ADD COLUMN brand TEXT;
  CREATE INDEX IF NOT EXISTS ads_rep ON ads(is_rep, segment);
  CREATE TABLE IF NOT EXISTS briefs (
    code TEXT PRIMARY KEY,
    source_kind TEXT NOT NULL,
    source_id TEXT NOT NULL,
    product_slug TEXT NOT NULL,
    colour_slug TEXT,
    tool TEXT NOT NULL DEFAULT 'flow',
    aspect TEXT NOT NULL DEFAULT '9:16',
    duration_s INTEGER NOT NULL DEFAULT 8,
    lang TEXT NOT NULL DEFAULT 'ar-DZ',
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    prompt TEXT,
    created_at TEXT,
    updated_at TEXT
  );
  `,
];

let _db;
export function dbPath() {
  if (process.env.LAB_DB) return process.env.LAB_DB;
  if (process.env.LAB_DATA_DIR) return path.join(process.env.LAB_DATA_DIR, "lab.db");
  return labPath(config().db_file || "data/lab.db");
}

export function db() {
  if (_db) return _db;
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  _db = new DatabaseSync(file);
  _db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  migrate(_db);
  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = undefined;
  }
}

function migrate(d) {
  d.exec("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);");
  const row = d.prepare("SELECT v FROM meta WHERE k='schema_version'").get();
  let v = row ? Number(row.v) : 0;
  while (v < MIGRATIONS.length) {
    d.exec("BEGIN");
    try {
      d.exec(MIGRATIONS[v]);
      v++;
      d.prepare("INSERT INTO meta(k,v) VALUES('schema_version',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(String(v));
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK");
      throw new Error(`migration ${v + 1} failed: ${e.message}`);
    }
  }
}

// node:sqlite rejects `undefined` binds; normalise to null and booleans to 0/1.
const norm = (params) =>
  params.map((x) => (x === undefined ? null : typeof x === "boolean" ? (x ? 1 : 0) : x));

export const run = (sql, ...p) => db().prepare(sql).run(...norm(p));
export const get = (sql, ...p) => db().prepare(sql).get(...norm(p));
export const all = (sql, ...p) => db().prepare(sql).all(...norm(p));

export function tx(fn) {
  const d = db();
  d.exec("BEGIN");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

/** Upsert by primary key using an object of column->value. */
export function upsert(table, pk, obj) {
  const cols = Object.keys(obj);
  const placeholders = cols.map(() => "?").join(",");
  const updates = cols.filter((c) => c !== pk).map((c) => `${c}=excluded.${c}`).join(",");
  const sql = `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders}) ON CONFLICT(${pk}) DO UPDATE SET ${updates}`;
  return run(sql, ...cols.map((c) => obj[c]));
}

export const stamp = () => nowIso();

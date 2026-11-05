// creative-lab :: spy orchestration — crawl → persist → score → download media.

import path from "node:path";
import { all, get, run, tx, upsert } from "./db.mjs";
import { config, labPath, nowIso, readJson, j, pj, sleep, jitter, logLine, dataPath } from "./util.mjs";
import { AdLibSession } from "./collector/adlib-web.mjs";
import { normalizeResult } from "./collector/normalize.mjs";
import { urlExpiry } from "./collector/parse.mjs";
import { downloadOne, mapLimit } from "./collector/media.mjs";
import { relevance, winnerScore, daysActive, copyKey } from "./scoring.mjs";
import { probe } from "./probe.mjs";

export function loadNiche(id = "sirine") {
  return readJson(labPath(`config/niche-${id}.json`));
}

const union = (a, b) => [...new Set([...(a || []), ...(b || [])].filter(Boolean))];

/** Persist one search's raw results. Returns { newAds, touched: [ad ids] }. */
export function persistResults(crawlId, results, ctx = {}) {
  const now = nowIso();
  let newAds = 0;
  const touched = [];
  const n = results.length;
  tx(() => {
    for (let i = 0; i < results.length; i++) {
      const raw = results[i];
      const { ad, page, media, snapshot } = normalizeResult(raw, ctx);
      // Position in an impressions-sorted pull → percentile (1 = most impressions).
      const impPct = ctx.sort === "impressions" && n > 1 ? 1 - i / (n - 1) : ctx.sort === "impressions" ? 1 : null;
      touched.push(ad.ad_archive_id);
      if (page) {
        const prev = get("SELECT first_seen_at FROM pages WHERE page_id=?", page.page_id);
        upsert("pages", "page_id", {
          page_id: page.page_id,
          page_name: page.page_name,
          like_count: page.like_count,
          categories: j(page.categories),
          profile_uri: page.profile_uri,
          first_seen_at: prev?.first_seen_at || now,
          last_seen_at: now,
        });
      }
      const prev = get("SELECT first_seen_at, seen_count, countries, queries, starred, hidden, tags, notes, media_status FROM ads WHERE ad_archive_id=?", ad.ad_archive_id);
      if (!prev) newAds++;
      upsert("ads", "ad_archive_id", {
        ad_archive_id: ad.ad_archive_id,
        collation_id: ad.collation_id,
        collation_count: ad.collation_count,
        page_id: ad.page_id,
        page_name: ad.page_name,
        is_active: ad.is_active,
        start_date: ad.start_date,
        end_date: ad.end_date,
        display_format: ad.display_format,
        platforms: j(ad.platforms),
        body: ad.body,
        title: ad.title,
        link_url: ad.link_url,
        link_domain: ad.link_domain,
        caption: ad.caption,
        link_description: ad.link_description,
        cta_text: ad.cta_text,
        cta_type: ad.cta_type,
        cards: j(ad.cards),
        countries: j(union(pj(prev?.countries, []), [ad.country])),
        queries: j(union(pj(prev?.queries, []), [ad.query])),
        contains_ai_media: ad.contains_ai_media,
        first_seen_at: prev?.first_seen_at || now,
        last_seen_at: now,
        seen_count: (prev?.seen_count || 0) + 1,
        lang: ad.lang,
        media_status: prev?.media_status || "none",
        starred: prev?.starred || 0,
        hidden: prev?.hidden || 0,
        tags: prev?.tags || null,
        notes: prev?.notes || null,
        snapshot: j(snapshot),
      });
      run(
        "INSERT INTO sightings(ad_archive_id, crawl_id, seen_at, is_active, collation_count, rank, n, sort) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",
        ad.ad_archive_id, crawlId, now, ad.is_active, ad.collation_count, i + 1, n, ctx.sort || "relevance",
      );
      // Only trust the percentile from pulls big enough to rank against (≥ 20 results).
      if (impPct !== null && n >= 20) run("UPDATE ads SET best_imp_pct = MAX(COALESCE(best_imp_pct, 0), ?) WHERE ad_archive_id=?", Number(impPct.toFixed(4)), ad.ad_archive_id);
      for (const m of media) {
        const ex = get("SELECT id, status FROM media WHERE owner_kind='ad' AND owner_id=? AND role=? AND idx=?", ad.ad_archive_id, m.role, m.idx);
        if (!ex) {
          run(
            "INSERT INTO media(owner_kind, owner_id, role, idx, source_url, status, created_at, expires_at) VALUES('ad',?,?,?,?, 'pending', ?, ?)",
            ad.ad_archive_id, m.role, m.idx, m.url, now, urlExpiry(m.url),
          );
        } else if (ex.status !== "ok") {
          // Fresh signed URL — replace the expired one.
          run("UPDATE media SET source_url=?, status='pending', error=NULL, expires_at=? WHERE id=?", m.url, urlExpiry(m.url), ex.id);
        }
      }
    }
  });
  return { newAds, touched };
}

/** Recompute page activity counts, relevance and winner score. */
export function rescore(adIds = null, nicheId = "sirine") {
  const niche = loadNiche(nicheId);
  const nowSec = Math.floor(Date.now() / 1000);
  // Page scale = distinct ACTIVE ads we have seen for the page in the last 14 days.
  const counts = new Map(
    all(
      "SELECT page_id, COUNT(*) n FROM ads WHERE is_active=1 AND last_seen_at >= ? GROUP BY page_id",
      new Date(Date.now() - 14 * 864e5).toISOString(),
    ).map((r) => [r.page_id, r.n]),
  );
  const everything = all("SELECT ad_archive_id, page_id, body, start_date, end_date, is_active FROM ads");
  // Relaunches: same page re-running the same copy as a NEW ad (different start dates).
  const groups = new Map();
  for (const a of everything) {
    if (!a.body) continue;
    const k = `${a.page_id}|${copyKey(a.body)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  const relaunch = new Map();
  for (const g of groups.values()) {
    const starts = new Set(g.map((a) => a.start_date));
    for (const a of g) relaunch.set(a.ad_archive_id, Math.max(0, starts.size - 1));
  }
  // Within-page survival percentile (only for pages with ≥ 5 observed ads).
  const byPage = new Map();
  for (const a of everything) {
    if (!byPage.has(a.page_id)) byPage.set(a.page_id, []);
    byPage.get(a.page_id).push({ id: a.ad_archive_id, d: daysActive(a, nowSec) ?? 0 });
  }
  const survival = new Map();
  for (const list of byPage.values()) {
    if (list.length < 5) continue;
    const sorted = [...list].sort((x, y) => x.d - y.d);
    sorted.forEach((x, i) => survival.set(x.id, i / (sorted.length - 1)));
  }
  const rows = adIds && adIds.length
    ? all(`SELECT * FROM ads WHERE ad_archive_id IN (${adIds.map(() => "?").join(",")})`, ...adIds)
    : all("SELECT * FROM ads");
  tx(() => {
    for (const [pid, n] of counts) run("UPDATE pages SET active_ads_seen=? WHERE page_id=?", n, pid);
    for (const r of rows) {
      const ad = { ...r, platforms: pj(r.platforms, []), cards: pj(r.cards, []) };
      const page = r.page_id ? get("SELECT categories, segment FROM pages WHERE page_id=?", r.page_id) : null;
      const rel = relevance(ad, { categories: pj(page?.categories, []), segment: page?.segment || null }, niche);
      const ws = winnerScore(ad, {
        pageActiveAds: counts.get(r.page_id) || 0,
        relaunchCount: relaunch.get(r.ad_archive_id) || 0,
        pageSurvivalPct: survival.has(r.ad_archive_id) ? survival.get(r.ad_archive_id) : null,
        impPct: r.best_imp_pct ?? null,
        countries: pj(r.countries, []),
        nowSec,
        relevance: rel.value,
      });
      run(
        "UPDATE ads SET relevance=?, score=?, score_breakdown=?, relaunch_count=? WHERE ad_archive_id=?",
        rel.value, ws.score, j({ ...ws, relevance_detail: rel }), relaunch.get(r.ad_archive_id) || 0, r.ad_archive_id,
      );
    }

    // Creative clusters: the same page re-running the same copy+format under many ad ids (or Meta's own
    // collation) is ONE creative. The library shows one representative per cluster (best score, media first).
    const all2 = all("SELECT a.ad_archive_id id, a.page_id, a.body, a.title, a.display_format, a.collation_id, a.score, a.media_status, COALESCE(p.segment, 'local') seg FROM ads a LEFT JOIN pages p ON p.page_id = a.page_id");
    const clusters = new Map();
    for (const a of all2) {
      const ck = a.collation_id ? `c:${a.collation_id}` : `${a.page_id}|${a.display_format}|${copyKey(a.body || a.title || a.id)}`;
      if (!clusters.has(ck)) clusters.set(ck, []);
      clusters.get(ck).push(a);
    }
    for (const [ck, list] of clusters) {
      list.sort((x, y) => (y.media_status === "ok") - (x.media_status === "ok") || (y.score || 0) - (x.score || 0));
      list.forEach((a, i) => run("UPDATE ads SET cluster_key=?, cluster_size=?, is_rep=?, segment=? WHERE ad_archive_id=?", ck, list.length, i === 0 ? 1 : 0, a.seg, a.id));
    }
  });
  return rows.length;
}

/** Download pending media for the given ads (default: top-N in-niche by score). */
export async function downloadMediaFor(adIds, { concurrency, onProgress } = {}) {
  concurrency ??= config().spy.media.concurrency;
  const pending = all(
    `SELECT * FROM media WHERE owner_kind='ad' AND status IN ('pending','failed') AND owner_id IN (${adIds.map(() => "?").join(",")})
     ORDER BY CASE role WHEN 'video' THEN 0 WHEN 'image' THEN 1 WHEN 'card_image' THEN 2 WHEN 'card_video' THEN 3 ELSE 4 END`,
    ...adIds,
  );
  let done = 0;
  const results = await mapLimit(pending, concurrency, async (m) => {
    const dir = dataPath("media/ads", m.owner_id);
    const r = await downloadOne(m.source_url, dir, `${m.role}-${m.idx}`);
    done++;
    onProgress?.({ done, total: pending.length, ok: r.ok });
    if (r.ok) {
      let meta = {};
      try {
        meta = probe(r.path);
      } catch {}
      run(
        "UPDATE media SET local_path=?, sha256=?, bytes=?, mime=?, width=?, height=?, duration=?, status='ok', error=NULL WHERE id=?",
        r.path, r.sha256, r.bytes, r.mime, meta.display_w ?? null, meta.display_h ?? null, meta.kind === "video" ? meta.duration : null, m.id,
      );
    } else {
      run("UPDATE media SET status=?, error=? WHERE id=?", r.expired ? "expired" : "failed", r.error, m.id);
    }
    return r;
  });
  // Roll media status up to the ad.
  for (const id of adIds) {
    const st = all("SELECT status FROM media WHERE owner_kind='ad' AND owner_id=? AND role IN ('video','image','card_image','card_video')", id).map((x) => x.status);
    const status = !st.length ? "none" : st.every((s) => s === "ok") ? "ok" : st.some((s) => s === "ok") ? "partial" : st.includes("expired") ? "expired" : "failed";
    run("UPDATE ads SET media_status=? WHERE ad_archive_id=?", status, id);
  }
  return { attempted: pending.length, ok: results.filter((r) => r.ok).length };
}

/**
 * Full crawl. `searches` = [{q,country,...} | {pageId,country}].
 * Stops all remaining searches at the first block signal.
 */
export async function runCrawl({ searches, maxResults, download = true, topN, nicheId = "sirine", onProgress = () => {} }) {
  const cfg = config().spy;
  topN ??= cfg.media.download_top_n;
  const session = await AdLibSession.open();
  const summary = [];
  const touchedAll = new Set();
  try {
    for (let i = 0; i < searches.length; i++) {
      const s = { sort: cfg.default_sort ?? null, ...searches[i] };
      const kind = s.pageId ? "page" : "search";
      const crawl = run("INSERT INTO crawls(kind, params, started_at, status) VALUES(?,?,?, 'running')", kind, j(s), nowIso());
      const crawlId = Number(crawl.lastInsertRowid);
      onProgress({ event: "search_start", i, total: searches.length, search: s });
      const res = await session.search(s, { maxResults: s.maxResults || maxResults, onProgress: (p) => onProgress({ event: "search_progress", i, ...p }) });
      const ctx = { country: s.country || "ALL", query: s.pageId ? `page:${s.pageId}` : s.q, sort: s.sort || null };
      const { newAds, touched } = persistResults(crawlId, res.results, ctx);
      touched.forEach((t) => touchedAll.add(t));
      const status = res.blocked ? "blocked" : res.error ? (res.results.length ? "partial" : "error") : "ok";
      run(
        "UPDATE crawls SET finished_at=?, status=?, reported_total=?, results=?, new_ads=?, error=? WHERE id=?",
        nowIso(), status, res.reported_total, res.results.length, newAds, res.error, crawlId,
      );
      summary.push({ crawlId, ...ctx, status, results: res.results.length, newAds, reported_total: res.reported_total, error: res.error });
      onProgress({ event: "search_done", i, status, results: res.results.length, newAds, reported_total: res.reported_total });
      if (res.blocked) break;
      if (i < searches.length - 1) await sleep(jitter(cfg.between_queries_ms || [6000, 12000]));
    }
  } finally {
    await session.close();
  }
  rescore(null, nicheId);
  let media = { attempted: 0, ok: 0 };
  if (download && touchedAll.size) {
    const ids = [...touchedAll];
    const top = all(
      `SELECT ad_archive_id FROM ads WHERE ad_archive_id IN (${ids.map(() => "?").join(",")})
       AND relevance >= ? AND media_status != 'ok' ORDER BY score DESC LIMIT ?`,
      ...ids, config().scoring.min_relevance, topN,
    ).map((r) => r.ad_archive_id);
    if (top.length) media = await downloadMediaFor(top, { onProgress: (p) => onProgress({ event: "media", ...p }) });
  }
  logLine("spy", { event: "crawl_done", searches: summary.length, touched: touchedAll.size, media });
  return { summary, touched: touchedAll.size, media };
}

/** Library query used by CLI + UI. */
export function topAds({ limit = 50, minRelevance, country, format, minDays, tier, includeHidden = false, starred, q, pageId } = {}) {
  minRelevance ??= config().scoring.min_relevance;
  const where = ["relevance >= ?"];
  const args = [minRelevance];
  if (!includeHidden) where.push("hidden = 0");
  if (country) {
    where.push("countries LIKE ?");
    args.push(`%"${country}"%`);
  }
  if (pageId) {
    where.push("page_id = ?");
    args.push(pageId);
  }
  if (starred) where.push("starred = 1");
  if (q) {
    where.push("(body LIKE ? OR title LIKE ? OR page_name LIKE ?)");
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  let rows = all(`SELECT * FROM ads WHERE ${where.join(" AND ")} ORDER BY score DESC LIMIT ?`, ...args, Math.max(limit * 4, 200));
  rows = rows
    .map((r) => ({ ...r, platforms: pj(r.platforms, []), cards: pj(r.cards, []), countries: pj(r.countries, []), queries: pj(r.queries, []), score_breakdown: pj(r.score_breakdown, {}), tags: pj(r.tags, []) }))
    .filter((r) => (!format || r.score_breakdown.format === format) && (!minDays || (r.score_breakdown.days_active ?? 0) >= minDays) && (!tier || r.score_breakdown.tier === tier));
  return rows.slice(0, limit);
}

export function adMedia(adId) {
  return all("SELECT * FROM media WHERE owner_kind='ad' AND owner_id=? ORDER BY role, idx", adId);
}

export function mediaDir(adId) {
  return dataPath("media/ads", adId);
}

export const _test = { union, path };

const normName = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9& ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Premium inspiration segment: big-name bag/shoe stores (config niche.premium_brands).
 * Per brand: keyword search in its best market → find the brand's own page(s) by name → mark
 * pages.segment='premium' → pull that page's ads impressions-sorted → download media for its best creatives.
 */
export async function runPremium({ nicheId = "sirine", brands = null, perPage = 60, mediaPerBrand = 15, onProgress = () => {} } = {}) {
  const niche = loadNiche(nicheId);
  let list = niche.premium_brands || [];
  if (brands?.length) list = list.filter((b) => brands.some((x) => normName(b.brand).includes(normName(x))));
  const cfg = config().spy;
  const session = await AdLibSession.open();
  const out = [];
  try {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const rec = { brand: b.brand, country: b.country, pages: [], ads: 0, status: "ok" };
      onProgress({ event: "search_start", i, total: list.length, search: { q: b.q, country: b.country } });
      const s = { q: b.q, country: b.country, sort: "impressions" };
      const crawl = run("INSERT INTO crawls(kind, params, started_at, status) VALUES('premium', ?, ?, 'running')", j(s), nowIso());
      const res = await session.search(s, { maxResults: 40 });
      persistResults(Number(crawl.lastInsertRowid), res.results, { country: b.country, query: b.q, sort: "impressions" });
      run("UPDATE crawls SET finished_at=?, status=?, results=? WHERE id=?", nowIso(), res.blocked ? "blocked" : "ok", res.results.length, Number(crawl.lastInsertRowid));
      if (res.blocked) {
        rec.status = "blocked";
        out.push(rec);
        break;
      }
      const counts = new Map();
      for (const r of res.results) {
        const { ad } = normalizeResult(r, {});
        const nm = normName(ad.page_name);
        // The page NAME must start with the brand as whole words ("Coach" ✓, "Migraine Coach" ✗, "Furlan Marri" ✗).
        if (b.match.some((m) => { const t = normName(m); return nm === t || nm.startsWith(t + " "); })) counts.set(ad.page_id, { name: ad.page_name, n: (counts.get(ad.page_id)?.n || 0) + 1 });
      }
      const pages = [...counts.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 2);
      for (const [pid, info] of pages) {
        run("UPDATE pages SET segment='premium', brand=? WHERE page_id=?", b.brand, pid);
        await sleep(jitter(cfg.between_queries_ms || [20000, 45000]));
        const ps = { pageId: pid, country: b.country, sort: "impressions" };
        const c2 = run("INSERT INTO crawls(kind, params, started_at, status) VALUES('premium_page', ?, ?, 'running')", j(ps), nowIso());
        const r2 = await session.search(ps, { maxResults: perPage });
        persistResults(Number(c2.lastInsertRowid), r2.results, { country: b.country, query: `page:${pid}`, sort: "impressions" });
        run("UPDATE crawls SET finished_at=?, status=?, results=? WHERE id=?", nowIso(), r2.blocked ? "blocked" : "ok", r2.results.length, Number(c2.lastInsertRowid));
        rec.pages.push({ page_id: pid, name: info.name, ads: r2.results.length });
        rec.ads += r2.results.length;
        if (r2.blocked) rec.status = "blocked";
      }
      out.push(rec);
      onProgress({ event: "search_done", i, status: rec.status, results: rec.ads, newAds: rec.pages.length, reported_total: null });
      logLine("spy", { event: "premium_brand", ...rec });
      if (rec.status === "blocked") break;
      if (i < list.length - 1) await sleep(jitter(cfg.between_queries_ms || [20000, 45000]));
    }
  } finally {
    await session.close();
  }
  rescore(null, nicheId);
  // Media: best representative creatives per premium page.
  const ids = [];
  for (const rec of out)
    for (const p of rec.pages)
      ids.push(...all("SELECT ad_archive_id FROM ads WHERE page_id=? AND is_rep=1 AND hidden=0 AND relevance >= ? AND media_status != 'ok' ORDER BY score DESC LIMIT ?", p.page_id, config().scoring.min_relevance, mediaPerBrand).map((r) => r.ad_archive_id));
  const media = ids.length ? await downloadMediaFor(ids, { onProgress: (p) => onProgress({ event: "media", ...p }) }) : { attempted: 0, ok: 0 };
  return { brands: out, media };
}

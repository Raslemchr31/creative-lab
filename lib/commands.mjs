// creative-lab :: CLI command table. Each entry: { help, run(args, flags) }.
// Commands stay thin — logic lives in lib/*.mjs so the UI server can reuse it.

import { runCrawl, runPremium, topAds, rescore, downloadMediaFor, loadNiche, adMedia } from "./spy.mjs";
import { get, run } from "./db.mjs";
import { syncProducts, listProducts, getProduct, addProductRef, setRefApproval } from "./products/sync.mjs";
import { colourways, allFamilies } from "./products/colour.mjs";
import { pj, LabError, readJson } from "./util.mjs";
import { buildEvidenceMany, saveDna, getDna, listDna } from "./analyze.mjs";

const num = (v, d) => (v === undefined || v === true ? d : Number(v));
const list = (v) => (v === undefined || v === true ? [] : String(v).split(",").map((s) => s.trim()).filter(Boolean));

function progressPrinter(flags) {
  if (flags.json || flags.quiet) return () => {};
  return (p) => {
    if (p.event === "search_start") process.stdout.write(`\n▶ [${p.i + 1}/${p.total}] ${p.search.pageId ? `page ${p.search.pageId}` : `"${p.search.q}"`} @ ${p.search.country || "ALL"} `);
    else if (p.event === "search_progress" && p.phase === "scroll") process.stdout.write(".");
    else if (p.event === "search_done") process.stdout.write(` ${p.status} — ${p.results} ads (${p.newAds} new) of ~${p.reported_total ?? "?"}`);
    else if (p.event === "media" && (p.done % 10 === 0 || p.done === p.total)) process.stdout.write(`\n  media ${p.done}/${p.total}`);
  };
}

function fmtRow(r) {
  const sb = r.score_breakdown || {};
  const body = (r.body || r.title || "").replace(/\s+/g, " ").slice(0, 70);
  return `${String(r.score?.toFixed?.(1) ?? r.score).padStart(5)}  ${String(sb.tier || "").padEnd(12)} ${String(Math.round(sb.days_active ?? 0)).padStart(4)}d  dup×${String(r.collation_count ?? 1).padEnd(3)} ${String(sb.format || "").padEnd(8)} ${String(r.media_status).padEnd(7)} ${r.ad_archive_id}  ${String(r.page_name || "").slice(0, 22).padEnd(22)}  ${body}`;
}

export const commands = {
  "spy search": {
    help: 'Collect ads for a keyword (impressions-sorted): --q "sac femme" --country DZ [--max 150] [--exact] [--sort relevance] [--all (incl. ended)] [--media-type video] [--no-media]',
    async run(_a, f) {
      if (!f.q) throw new LabError("ARGS", "--q is required");
      const searches = [{ q: String(f.q), country: f.country || "DZ", exact: !!f.exact, mediaType: f["media-type"] || "all", sort: f.sort === "relevance" ? null : "impressions", activeStatus: f.all ? "all" : "active" }];
      return runCrawl({ searches, maxResults: num(f.max, undefined), download: !f["no-media"], topN: num(f.top, undefined), onProgress: progressPrinter(f) });
    },
  },
  "spy page": {
    help: "Collect all active ads of one Facebook page: --page-id 123 [--country DZ] [--max 300]",
    async run(_a, f) {
      if (!f["page-id"]) throw new LabError("ARGS", "--page-id is required");
      const searches = list(f["page-id"]).map((pageId) => ({ pageId, country: f.country || "ALL" }));
      return runCrawl({ searches, maxResults: num(f.max, 300), download: !f["no-media"], topN: num(f.top, undefined), onProgress: progressPrinter(f) });
    },
  },
  "spy niche": {
    help: "Run every saved niche query (config/niche-<id>.json): [--niche sirine] [--market local|regional|inspiration] [--max 120] [--no-media]",
    async run(_a, f) {
      const niche = loadNiche(f.niche || "sirine");
      let qs = niche.queries;
      if (f.market) qs = qs.filter((q) => q.market === f.market);
      if (f.limit) qs = qs.slice(0, Number(f.limit));
      const pages = (niche.watch_pages || []).map((p) => ({ pageId: p.page_id || p, country: p.country || "ALL" }));
      const searches = [...qs, ...(f["with-pages"] ? pages : [])];
      return runCrawl({ searches, maxResults: num(f.max, 120), download: !f["no-media"], topN: num(f.top, undefined), nicheId: f.niche || "sirine", onProgress: progressPrinter(f) });
    },
  },
  "spy premium": {
    help: "Big-name inspiration segment (config niche.premium_brands): find each brand's page, pull its ads impressions-sorted, download media for its best creatives: [--brands \"Coach,Aldo\"] [--per-page 60] [--media 15]",
    async run(_a, f) {
      return runPremium({ brands: list(f.brands), perPage: num(f["per-page"], 60), mediaPerBrand: num(f.media, 15), onProgress: progressPrinter(f) });
    },
  },
  "spy top": {
    help: "Show top in-niche winners: [--limit 30] [--country DZ] [--format video|image|carousel] [--min-days 30] [--tier proven|rising] [--q text]",
    async run(_a, f) {
      const rows = topAds({ limit: num(f.limit, 30), country: f.country, format: f.format, minDays: num(f["min-days"], 0), tier: f.tier, q: f.q, pageId: f["page-id"], starred: !!f.starred, minRelevance: f["min-relevance"] !== undefined ? Number(f["min-relevance"]) : undefined });
      if (f.json) return rows;
      return [" score  tier         days  dup   format   media   ad_archive_id     page                    copy", ...rows.map(fmtRow)].join("\n");
    },
  },
  "spy media": {
    help: "Download media for ads: --ids a,b,c  or  --top 30 (in-niche, best first)",
    async run(_a, f) {
      let ids = list(f.ids);
      if (!ids.length) ids = topAds({ limit: num(f.top, 30) }).filter((r) => r.media_status !== "ok").map((r) => r.ad_archive_id);
      if (!ids.length) return { attempted: 0, ok: 0, note: "nothing pending" };
      return downloadMediaFor(ids, { onProgress: progressPrinter(f) });
    },
  },
  "spy rescore": {
    help: "Recompute relevance + winner scores for the whole library",
    async run() {
      return { rescored: rescore() };
    },
  },
  "spy show": {
    help: "Show one ad with its media + score breakdown: --id <ad_archive_id>",
    async run(_a, f) {
      const ad = get("SELECT * FROM ads WHERE ad_archive_id=?", String(f.id));
      if (!ad) throw new LabError("NOT_FOUND", `ad ${f.id} not in library`);
      const { snapshot, ...rest } = ad;
      return { ...rest, platforms: pj(ad.platforms), cards: pj(ad.cards), score_breakdown: pj(ad.score_breakdown), media: adMedia(ad.ad_archive_id).map(({ source_url, ...m }) => m) };
    },
  },
  "spy star": {
    help: "Star / unstar / hide an ad: --id X [--off] [--hide]",
    async run(_a, f) {
      if (f.hide) run("UPDATE ads SET hidden=? WHERE ad_archive_id=?", f.off ? 0 : 1, String(f.id));
      else run("UPDATE ads SET starred=? WHERE ad_archive_id=?", f.off ? 0 : 1, String(f.id));
      return { ok: true };
    },
  },
};

// ── products (store sync) ────────────────────────────────────────────────────
Object.assign(commands, {
  "product sync": {
    help: "Sync products from the SIRINE store (Turso DB, falls back to the public feed) + cache photos: [--source auto|turso|feed]",
    async run(_a, f) {
      return syncProducts({ source: f.source || "auto" });
    },
  },
  "product list": {
    help: "List synced products: [--in-stock]",
    async run(_a, f) {
      const ps = listProducts({ inStockOnly: !!f["in-stock"] });
      if (f.json) return ps;
      return ps
        .map((p) => `${p.inStock ? "●" : "○"} ${p.slug.padEnd(34)} ${String(p.price).padStart(6)} DA${p.compareAt ? ` (~~${p.compareAt}~~)` : ""}  ${p.category.padEnd(10)} refs:${p.refs.filter((r) => r.approved).length}/${p.refs.length}${p.freeGift ? `  🎁 ${p.freeGift.ar || p.freeGift.fr}` : ""}  ${p.name.ar || p.name.fr}`)
        .join("\n");
    },
  },
  "product show": {
    help: "Show one product with its reference photos: --slug pack-hobo-noire",
    async run(_a, f) {
      const p = getProduct(String(f.slug));
      if (!p) throw new LabError("NOT_FOUND", `product ${f.slug}`);
      return p;
    },
  },
  "product ref-add": {
    help: "Attach an extra reference photo (real photo/detail): --slug X --file path|url [--role detail|hero|in_hand|packaging|gift] [--note text]",
    async run(_a, f) {
      return addProductRef(String(f.slug), String(f.file), { role: f.role || "detail", note: f.note || null });
    },
  },
  "product colours": {
    help: "Measured colour of every colourway (store swatch vs photo-measured hex, ΔE00, descriptor, COLOUR LOCK): --slug pack-hobo-noire | --all  [--force (re-measure)] [--lock (print the lock sentences)]",
    async run(_a, f) {
      if (!f.slug && !f.all) throw new LabError("ARGS", "--slug <slug> or --all");
      const fams = f.all ? allFamilies() : [{ family: null, slug: String(f.slug) }];
      const out = fams.map((x) => ({ family: x.family, items: colourways(x.slug, { force: !!f.force }) }));
      if (f.json) return f.all ? out : out[0].items;
      const L = [];
      for (const { items } of out) {
        L.push(`\n${"slug".padEnd(34)} ${"store".padEnd(8)} ${"measured".padEnd(8)} ${"ΔE00".padStart(5)}  ${"descriptor".padEnd(24)} stock  photo`);
        for (const c of items) {
          L.push(`${c.slug.padEnd(34)} ${String(c.store_hex || "—").padEnd(8)} ${String(c.measured_hex || "—").padEnd(8)} ${String(c.deltaE_store_vs_measured ?? "—").padStart(5)}  ${String(c.descriptor_en || "—").padEnd(24)} ${c.in_stock ? "yes  " : "OUT  "}  ${c.source_photo ? `#${c.source_photo.idx}` : "no packshot → store swatch"}`);
          if (f.lock) L.push(`  ${c.colour_lock}`);
        }
      }
      return L.join("\n").trim();
    },
  },
  "product ref-approve": {
    help: "Approve / reject a reference photo for generation: --slug X --idx 2 [--off]",
    async run(_a, f) {
      return setRefApproval(String(f.slug), Number(f.idx), !f.off);
    },
  },
});

// ── analysis (evidence packs + creative DNA) ─────────────────────────────────
Object.assign(commands, {
  "analyze evidence": {
    help: "Build evidence packs (contact sheet, hook strip, keyframes, ASR, palette): --ids a,b | --top 12 [--force] [--no-asr] [--concurrency 2]",
    async run(_a, f) {
      let ids = list(f.ids);
      if (!ids.length) ids = topAds({ limit: num(f.top, 12) }).filter((r) => r.media_status === "ok" || r.media_status === "partial").map((r) => r.ad_archive_id);
      return buildEvidenceMany(ids, { force: !!f.force, asr: !f["no-asr"], concurrency: num(f.concurrency, 2), onProgress: f.json ? undefined : (p) => console.log(`  [${p.done}/${p.total}] ${p.id} ${p.ok ? "✓" : "✗ " + p.error}`) });
    },
  },
  "dna template": {
    help: "Print a DNA skeleton for an ad (fill it, then dna set): --id <ad_archive_id>",
    async run(_a, f) {
      const ad = get("SELECT * FROM ads WHERE ad_archive_id=?", String(f.id));
      if (!ad) throw new LabError("NOT_FOUND", `ad ${f.id}`);
      return dnaTemplate(ad);
    },
  },
  "dna set": {
    help: "Validate + save a DNA JSON: --file dna.json [--analyst claude|owner]",
    async run(_a, f) {
      const dna = readJson(String(f.file));
      return saveDna(dna, { analyst: f.analyst || "claude" });
    },
  },
  "dna show": {
    help: "Show a stored DNA: --id <ref id>",
    async run(_a, f) {
      const d = getDna(String(f.id));
      if (!d) throw new LabError("NOT_FOUND", `no DNA for ${f.id}`);
      return d;
    },
  },
  "dna list": {
    help: "List analysed references (archetype · hook · angle · format)",
    async run(_a, f) {
      const ds = listDna();
      if (f.json) return ds;
      return ds.map((d) => `${d.id.padEnd(18)} ${d.format.padEnd(9)} ${d.archetype.padEnd(18)} ${d.hook.type.padEnd(16)} ${d.angle.padEnd(16)} feas ${d.replication.feasibility}/5  conf ${d.confidence}`).join("\n") || "(no DNA yet)";
    },
  },
});

// ── styles + batches ─────────────────────────────────────────────────────────
Object.assign(commands, {
  "style set": {
    help: "Validate + save a style card: --file style.json [--status draft|approved]",
    async run(_a, f) {
      const { saveStyle } = await import("./styles.mjs");
      const s = saveStyle(readJson(String(f.file)), { status: f.status });
      return { saved: s.id, status: s.status, beats: s.beats.length };
    },
  },
  "style list": {
    help: "List style cards",
    async run(_a, f) {
      const { listStyles, rungOf } = await import("./styles.mjs");
      const ss = listStyles();
      if (f.json) return ss;
      return ss.map((s) => `${s.status === "approved" ? "✓" : "·"} ${s.id.padEnd(30)} ${s.format.padEnd(8)} ${s.archetype.padEnd(18)} ${s.hook_type.padEnd(15)} beats:${s.beats.map((b) => `${b.id}[${rungOf(b.strategy)}]`).join(" ")}  refs:${s.refs.length}`).join("\n") || "(no styles yet)";
    },
  },
  "style show": {
    help: "Show a style card: --id <style id>",
    async run(_a, f) {
      const { getStyle } = await import("./styles.mjs");
      const s = getStyle(String(f.id));
      if (!s) throw new LabError("NOT_FOUND", `style ${f.id}`);
      return s;
    },
  },
  "batch new": {
    help: 'Compile a batch + run preflight: --items "slug:style1+style2,slug2:style3" [--name x] [--placements 9:16,4:5] [--lang ar-DZ|fr] [--draft]  or  --file batch.json',
    async run(_a, f) {
      const { createBatch, preflightReport } = await import("./batch.mjs");
      let spec;
      if (f.file) spec = readJson(String(f.file));
      else {
        const items = list(f.items).map((x) => {
          const [product, styles] = x.split(":");
          return { product, styles: (styles || "").split("+").filter(Boolean) };
        });
        spec = { name: f.name, items, settings: { draft: !!f.draft, lang: f.lang, placements: f.placements ? list(f.placements) : undefined } };
      }
      const b = await createBatch(spec);
      return f.json ? b : preflightReport(b);
    },
  },
  "batch preflight": {
    help: "Re-run the pre-generation audit: --batch <id>",
    async run(_a, f) {
      const { runPreflight, preflightReport } = await import("./batch.mjs");
      const b = await runPreflight(String(f.batch));
      return f.json ? b : preflightReport(b);
    },
  },
  "batch list": {
    help: "List batches",
    async run(_a, f) {
      const { listBatches } = await import("./batch.mjs");
      const bs = listBatches();
      return f.json ? bs : bs.map((b) => `${b.id}  ${b.status.padEnd(10)} jobs:${b.jobs}  est ${b.est_credits} cr ≈ $${b.est_usd}  spent ${b.spent_credits}  ${b.name}`).join("\n") || "(no batches)";
    },
  },
  "batch show": {
    help: "Show a batch (jobs, tasks, prompts): --batch <id> [--job <id>]",
    async run(_a, f) {
      const { getBatch } = await import("./batch.mjs");
      const b = getBatch(String(f.batch));
      if (!b) throw new LabError("NOT_FOUND", `batch ${f.batch}`);
      if (f.job) return b.jobs.find((x) => x.id === f.job) || null;
      return b;
    },
  },
  "batch delete": {
    help: "Delete a batch and its files: --batch <id> --confirm <id>",
    async run(_a, f) {
      if (f.confirm !== f.batch) throw new LabError("CONFIRM", "pass --confirm <batch id> to delete");
      const { deleteBatch } = await import("./batch.mjs");
      return deleteBatch(String(f.batch));
    },
  },
});

// ── generation + QA ──────────────────────────────────────────────────────────
Object.assign(commands, {
  "gen run": {
    help: "Generate (staged, resumable): --batch B --confirm B [--stage A|B] [--through] [--mock] [--dry-run] [--max-credits N]",
    async run(_a, f) {
      const { runGeneration } = await import("./generate.mjs");
      const pr = f.json || f.quiet ? () => {} : (p) => {
        if (p.event === "balance") console.log(`  Kie balance: ${p.credits} credits`);
        else if (p.event === "created") console.log(`  ↑ ${p.id}  (${p.model})`);
        else if (p.event === "done") console.log(`  ✓ ${p.id}  ${p.state}`);
        else if (p.event === "failed" || p.event === "error") console.log(`  ✗ ${p.id}  ${p.error}`);
        else if (p.event === "op") console.log(`  ⚙ ${p.kind} ${p.id}`);
        else if (p.event === "op_failed") console.log(`  ✗ op ${p.id}  ${p.error}`);
      };
      const s = await runGeneration({ batchId: String(f.batch), confirm: f.confirm, stage: f.stage || "auto", through: !!f.through, dryRun: !!f["dry-run"], mock: !!f.mock, maxCredits: f["max-credits"] !== undefined ? Number(f["max-credits"]) : undefined, onProgress: pr });
      if (s.dry_requests?.length && !f.json) s.dry_requests = `${s.dry_requests.length} requests written to data/batches/${f.batch}/jobs/*/dry-run/`;
      return s;
    },
  },
  "gen status": {
    help: "Task/op states for a batch: --batch B",
    async run(_a, f) {
      const { all: q } = await import("./db.mjs");
      const tasks = q("SELECT stage, route, state, COUNT(*) n, SUM(COALESCE(credits, est_credits)) c FROM tasks WHERE batch_id=? GROUP BY stage, route, state ORDER BY stage, route", String(f.batch));
      const ops = q("SELECT kind, state, COUNT(*) n FROM ops WHERE batch_id=? GROUP BY kind, state", String(f.batch));
      const b = q("SELECT status, est_credits, spent_credits FROM batches WHERE id=?", String(f.batch))[0];
      return { batch: f.batch, ...b, tasks, ops };
    },
  },
  "qa select": {
    help: "Use this candidate downstream (unselects its siblings): --task <task id>",
    async run(_a, f) {
      const { selectCandidate } = await import("./generate.mjs");
      return selectCandidate(String(f.task));
    },
  },
  "qa pack": {
    help: "Build vision-QA compare sheets (reference vs outputs) for Claude/owner review: --batch B [--stage A|B]",
    async run(_a, f) {
      const { buildVisionPack } = await import("./qa/vision.mjs");
      return buildVisionPack(String(f.batch), { stage: f.stage });
    },
  },
  "qa set": {
    help: "Record a vision-QA verdict for a task output: --file qa.json  (schema: schemas/qa-vision.schema.json)",
    async run(_a, f) {
      const { recordVisionQa } = await import("./qa/vision.mjs");
      return recordVisionQa(readJson(String(f.file)));
    },
  },
});

// ── assembly + export ────────────────────────────────────────────────────────
Object.assign(commands, {
  "assemble run": {
    help: "Render finals (9:16 + 4:5) in Remotion from the EDLs: --batch B [--job J] [--placeholder (grey boxes for missing shots)] [--scale 0.5 draft]",
    async run(_a, f) {
      const { assembleBatch, assembleJob } = await import("./assemble.mjs");
      const opts = { placeholder: !!f.placeholder, scale: f.scale ? Number(f.scale) : undefined };
      return f.job ? assembleJob(String(f.job), opts) : assembleBatch(String(f.batch), opts);
    },
  },
  "assemble approve": {
    help: "Owner approval of a rendered final (needed before export): --asset <asset id> [--off]",
    async run(_a, f) {
      const { approveAsset } = await import("./assemble.mjs");
      return approveAsset(String(f.asset), !f.off);
    },
  },
  "export run": {
    help: "Copy approved finals + copy + lineage to ad-engine/config/clients/<client>/creative/lab-<batch>/: --batch B",
    async run(_a, f) {
      const { exportBatch } = await import("./assemble.mjs");
      return exportBatch(String(f.batch));
    },
  },
});

function dnaTemplate(ad) {
  const sb = pj(ad.score_breakdown, {});
  return {
    ref: { kind: "adlib", id: ad.ad_archive_id, page_name: ad.page_name, url: `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}` },
    format: sb.format === "catalog" ? "catalog" : sb.format || "video",
    aspect: "9:16",
    duration_s: null,
    language: ad.lang === "ar" ? "ar-DZ" : ad.lang || "ar-DZ",
    archetype: "offer_stack",
    secondary_archetypes: [],
    angle: "value_price",
    secondary_angles: [],
    awareness: "product_aware",
    persona: "",
    hook: { type: "price_shock", first_frame: "", text: null, spoken: null, seconds: 1.5, why: "" },
    beats: [{ role: "hook", t0: 0, t1: 1.5, shot: "product_hero", visual: "", camera: "static", transition_in: "none", text_overlay: null, overlay_style: "headline", audio: null }],
    offer: { price_shown: false, price_text: null, strike_price: false, bundle: false, bundle_desc: null, gift: false, cod: false, free_delivery: false, delivery_scope: null, urgency: null, first_seen_s: null },
    text_overlay: { density: "low", language: "ar-DZ", positions: ["top"], styles: [], font_feel: null, persistent_rail: false },
    production: { style: "phone_ugc", talent: "none", setting: null, lighting: null, palette: [], pace: "medium", cuts_per_10s: null, transitions: [], music: "unknown", voiceover: "none", sfx: false, ai_generated_signs: null },
    cta: { button: ad.cta_type && ad.cta_type !== "NO_BUTTON" ? ad.cta_type : "ORDER_NOW", on_screen: null, in_copy: null, destination: "website" },
    copy: { framework: "offer_first", length: "medium", language: ad.lang === "fr" ? "fr" : "ar-DZ", structure: null, emoji_density: "medium", key_phrases: [] },
    replication: { feasibility: 3, needs: [], risks: [], what_to_copy: [""], what_to_avoid: [], ip_flags: [] },
    confidence: 0.7,
    notes: null,
  };
}

export function register(extra) {
  Object.assign(commands, extra);
}

// ── briefs: reference ad/style + product + format → code → Claude writes the video prompt ─────────
import { createBrief, getBrief, listBriefs, briefContext, savePrompt } from "./briefs.mjs";
import fsBriefs from "node:fs";

Object.assign(commands, {
  "brief new": {
    help: "Make a prompt code (FL-XXXXX) from a reference + a product: --ad <ad_id> | --style <id>  --product <slug> [--aspect 9:16|16:9] [--duration 8] [--model veo-3.1-fast|veo-3.1-quality|veo-3.1-lite|omni-flash] [--mode auto|ingredients|frames|text] [--vo auto|on|off] [--notes text]",
    async run(_a, f) {
      const b = createBrief({ source_kind: f.style ? "style" : "ad", source_id: f.style || f.ad, product_slug: f.product, aspect: f.aspect, duration_s: f.duration, model: f.model, mode: f.mode, vo: f.vo, notes: typeof f.notes === "string" ? f.notes : null });
      return f.json ? b : `${b.code}  ←  give this code to Claude\n${b.source_kind} ${b.source_id} × ${b.product_slug} · ${b.aspect} · ${b.duration_s}s · ${b.model} · ${b.mode}`;
    },
  },
  "brief list": {
    help: "List prompt codes: [--limit 50]",
    async run(_a, f) {
      const rows = listBriefs(num(f.limit, 50));
      if (f.json) return rows;
      return rows.map((b) => `${b.code}  ${b.status.padEnd(9)} ${b.source_kind} ${String(b.source_id).padEnd(18)} × ${b.product_slug.padEnd(24)} ${b.aspect} ${b.duration_s}s ${b.model}`).join("\n") || "no briefs yet";
    },
  },
  "brief context": {
    help: "Everything Claude needs for a code (writes data/briefs/<code>/CONTEXT.md + context.json): --code FL-XXXXX",
    async run(_a, f) {
      const c = briefContext(f.code);
      return f.json ? c : fsBriefs.readFileSync(`${c.dir}/CONTEXT.md`, "utf8") + `\n(full JSON: ${c.dir}/context.json)`;
    },
  },
  "brief prompt": {
    help: "Save the finished prompt for a code (shows in the UI): --code FL-XXXXX --file prompt.md",
    async run(_a, f) {
      if (!f.file) throw new LabError("ARGS", "--file is required");
      const b = savePrompt(f.code, fsBriefs.readFileSync(String(f.file), "utf8"));
      return { code: b.code, status: b.status, chars: b.prompt.length };
    },
  },
  "brief show": {
    help: "Show one code (and its prompt if written): --code FL-XXXXX",
    async run(_a, f) {
      const b = getBrief(f.code);
      if (!b) throw new LabError("NOT_FOUND", `brief ${f.code}`);
      return b;
    },
  },
});
